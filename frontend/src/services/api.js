import { authService } from './auth';

const API_BASE_URL = import.meta.env.VITE_API_URL || window.API_URL || '';

async function request(path, options = {}) {
  const session = await authService.getCurrentUser();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  if (session?.idToken) {
    headers['Authorization'] = `Bearer ${session.idToken}`;
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.message || 'API request failed');
  }

  return response.json();
}

// ─── Mock Engine for Demo Mode ────────────────────────────────────
const mockDelay = (ms = 500) => new Promise((resolve) => setTimeout(resolve, ms));

const MOCK_TAGS = [
  'Landscape', 'Mountain', 'Travel', 'Ocean', 'Sunset', 'Nature', 'City', 'Architecture',
  'Technology', 'Laptop', 'Office', 'Coffee', 'Portrait', 'Smiling', 'People', 'Food',
  'Delicious', 'Pet', 'Cat', 'Dog', 'Cute', 'Forest', 'Adventure', 'Sky', 'Art'
];

const MOCK_MODERATION = [
  { name: 'Suggestive Content', confidence: 85.5 },
  { name: 'Explicit Content', confidence: 62.0 },
  { name: 'Violence', confidence: 78.4 }
];

function getMockImages(userId) {
  const allImages = JSON.parse(localStorage.getItem('mock_images') || '[]');
  // Filter by userId or return all if admin
  const session = JSON.parse(localStorage.getItem('mock_session') || '{}');
  if (session.role === 'admin') {
    return allImages;
  }
  return allImages.filter((img) => img.userId === userId);
}

function saveMockImages(images) {
  localStorage.setItem('mock_images', JSON.stringify(images));
}

// Simulate backend processing pipeline
function runMockProcessing(imageId, userId, imageFile) {
  setTimeout(async () => {
    const images = JSON.parse(localStorage.getItem('mock_images') || '[]');
    const imgIndex = images.findIndex((img) => img.imageId === imageId);
    if (imgIndex === -1) return;

    // Transition 1: PROCESSING
    images[imgIndex].status = 'PROCESSING';
    // Generate mock EXIF data
    const cameras = ['iPhone 15 Pro', 'Fujifilm X-T5', 'Sony A7 IV', 'Canon EOS R5'];
    images[imgIndex].exifData = {
      camera: cameras[Math.floor(Math.random() * cameras.length)],
      focalLength: `${Math.floor(Math.random() * 50) + 18}mm`,
      iso: [100, 200, 400, 800, 1600][Math.floor(Math.random() * 5)],
      gps: { lat: 21.0285, lng: 105.8542 } // Hanoi coordinates
    };
    saveMockImages(images);

    // Broadcast change
    window.dispatchEvent(new CustomEvent('mock-image-updated', { detail: { imageId } }));

    // Wait another 1.5s for AI analysis
    await mockDelay(1500);

    const latestImages = JSON.parse(localStorage.getItem('mock_images') || '[]');
    const index = latestImages.findIndex((img) => img.imageId === imageId);
    if (index === -1) return;

    // Detect if "unsafe" tag is present in name/type for demonstration
    const isUnsafe = imageFile.name.toLowerCase().includes('unsafe') || 
                      imageFile.name.toLowerCase().includes('nude') || 
                      imageFile.name.toLowerCase().includes('blood');

    // Generate random AI tags
    const numTags = 3 + Math.floor(Math.random() * 3);
    const tags = [];
    while (tags.length < numTags) {
      const tag = MOCK_TAGS[Math.floor(Math.random() * MOCK_TAGS.length)];
      if (!tags.find(t => t.name === tag)) {
        tags.push({ name: tag, confidence: parseFloat((85 + Math.random() * 14).toFixed(1)) });
      }
    }

    latestImages[index].aiTags = tags;

    if (isUnsafe) {
      latestImages[index].moderationStatus = 'FLAGGED';
      latestImages[index].status = 'COMPLETED'; // processed, but flagged
      latestImages[index].moderationLabels = [
        MOCK_MODERATION[Math.floor(Math.random() * MOCK_MODERATION.length)]
      ];
    } else {
      latestImages[index].moderationStatus = 'SAFE';
      latestImages[index].status = 'COMPLETED';
      latestImages[index].moderationLabels = [];
    }

    saveMockImages(latestImages);
    window.dispatchEvent(new CustomEvent('mock-image-updated', { detail: { imageId } }));
  }, 1500);
}

export const apiService = {
  // --- Presigned Upload URL ---
  async getPresignedUrl(filename, contentType, fileSize) {
    if (authService.isDemoMode()) {
      await mockDelay(300);
      const imageId = 'img_' + Math.random().toString(36).substr(2, 9).toUpperCase();
      return {
        imageId,
        uploadUrl: 'mock://s3-upload',
        fields: {
          key: `users/mock/original/${imageId}_${filename}`,
        },
      };
    }

    return request('/v1/images/presigned-url', {
      method: 'POST',
      body: JSON.stringify({ filename, contentType, fileSize }),
    });
  },

  // --- Upload to S3 (handles actual S3 or Mock upload) ---
  async uploadImageToS3(uploadUrl, fields, file, onProgress) {
    if (authService.isDemoMode()) {
      // Simulate upload progress
      for (let i = 10; i <= 100; i += 20) {
        await mockDelay(150);
        if (onProgress) onProgress(i);
      }

      const session = await authService.getCurrentUser();
      // Extract imageId from key format: users/mock/original/img_XXXXXXX_filename
      const keyFilename = fields.key.split('/').pop();
      const imageId = keyFilename.split('_').slice(0, 2).join('_'); // "img_XXXXXXX"
      const imageUrl = URL.createObjectURL(file); // Create local URL for display in browser

      const newImage = {
        imageId,
        userId: session.userId,
        originalKey: fields.key,
        thumbnailUrl: imageUrl, // use object URL locally
        resizedUrl: imageUrl,
        originalFilename: file.name,
        mimeType: file.type,
        fileSize: file.size,
        dimensions: { width: 1920, height: 1080 },
        status: 'UPLOADING',
        moderationStatus: 'SAFE',
        visibility: 'PRIVATE',
        createdAt: new Date().toISOString(),
        aiTags: [],
        exifData: null,
      };

      const images = JSON.parse(localStorage.getItem('mock_images') || '[]');
      images.unshift(newImage);
      saveMockImages(images);

      // Trigger local background processing
      runMockProcessing(imageId, session.userId, file);

      return { imageId };
    }

    // Real AWS S3 Upload — PUT with raw file body (matches PutObject presigned URL)
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl, true); // PUT, not POST — PutObject presigned URL
      xhr.setRequestHeader('Content-Type', file.type);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          const percentComplete = Math.round((e.loaded / e.total) * 100);
          onProgress(percentComplete);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`S3 upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('S3 upload network error'));
      xhr.send(file); // Send raw file, not FormData
    });
  },

  // --- List Images ---
  async listImages(limit = 20, cursor = '') {
    const session = await authService.getCurrentUser();
    if (authService.isDemoMode()) {
      await mockDelay(400);
      const images = getMockImages(session.userId);
      return {
        images,
        nextCursor: null,
        totalCount: images.length,
      };
    }

    let url = `/v1/images?limit=${limit}`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
    return request(url);
  },

  // --- List Public Images ---
  async getPublicImages(limit = 20, cursor = '') {
    if (authService.isDemoMode()) {
      await mockDelay(400);
      const allImages = JSON.parse(localStorage.getItem('mock_images') || '[]');
      const publicImages = allImages.filter((img) => img.visibility === 'PUBLIC');
      return {
        images: publicImages,
        nextCursor: null,
        totalCount: publicImages.length,
      };
    }

    let url = `/v1/images/public?limit=${limit}`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
    return request(url);
  },

  // --- Get Image Detail ---
  async getImage(imageId) {
    if (authService.isDemoMode()) {
      await mockDelay(200);
      const allImages = JSON.parse(localStorage.getItem('mock_images') || '[]');
      const image = allImages.find((img) => img.imageId === imageId);
      if (!image) throw new Error('Image not found');
      return image;
    }

    return request(`/v1/images/${imageId}`);
  },

  // --- Update Image visibility / metadata ---
  async updateImage(imageId, updates) {
    if (authService.isDemoMode()) {
      await mockDelay(300);
      const allImages = JSON.parse(localStorage.getItem('mock_images') || '[]');
      const index = allImages.findIndex((img) => img.imageId === imageId);
      if (index === -1) throw new Error('Image not found');
      
      allImages[index] = { ...allImages[index], ...updates };
      saveMockImages(allImages);
      return allImages[index];
    }

    return request(`/v1/images/${imageId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  // --- Delete Image ---
  async deleteImage(imageId) {
    if (authService.isDemoMode()) {
      await mockDelay(300);
      const allImages = JSON.parse(localStorage.getItem('mock_images') || '[]');
      const filtered = allImages.filter((img) => img.imageId !== imageId);
      saveMockImages(filtered);
      return { success: true };
    }

    return request(`/v1/images/${imageId}`, {
      method: 'DELETE',
    });
  },

  // --- Search by Tag ---
  async searchByTag(tag) {
    const session = await authService.getCurrentUser();
    if (authService.isDemoMode()) {
      await mockDelay(400);
      const images = getMockImages(session.userId);
      const filtered = images.filter((img) => 
        img.aiTags?.some(t => t.name.toLowerCase() === tag.toLowerCase())
      );
      return {
        images: filtered,
        nextCursor: null,
        totalCount: filtered.length,
      };
    }

    return request(`/v1/images/search?tag=${encodeURIComponent(tag)}`);
  },

  // --- Get Download URL (for actual private raw file downloading) ---
  async getDownloadUrl(imageId) {
    if (authService.isDemoMode()) {
      await mockDelay(200);
      const image = await this.getImage(imageId);
      return { downloadUrl: image.thumbnailUrl };
    }

    return request(`/v1/images/${imageId}/download`);
  },

  // --- Admin Moderation Queue ---
  async getModerationQueue() {
    if (authService.isDemoMode()) {
      await mockDelay(400);
      const allImages = JSON.parse(localStorage.getItem('mock_images') || '[]');
      // return FLAGGED images
      const flagged = allImages.filter((img) => img.moderationStatus === 'FLAGGED');
      return { images: flagged };
    }

    return request('/v1/admin/moderation');
  },

  // --- Moderate Action (Approve / Reject) ---
  async moderateImage(imageId, action) {
    // action: 'APPROVE' or 'REJECT'
    if (authService.isDemoMode()) {
      await mockDelay(300);
      const allImages = JSON.parse(localStorage.getItem('mock_images') || '[]');
      const index = allImages.findIndex((img) => img.imageId === imageId);
      if (index === -1) throw new Error('Image not found');

      if (action === 'APPROVE') {
        allImages[index].moderationStatus = 'SAFE';
        allImages[index].moderationLabels = [];
      } else {
        allImages[index].moderationStatus = 'REJECTED';
        // Mock image removal if rejected
        allImages[index].thumbnailUrl = 'placeholder_rejected'; // simulated block
      }
      saveMockImages(allImages);
      return { success: true };
    }

    return request(`/v1/admin/moderation/${imageId}`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
  },
};
