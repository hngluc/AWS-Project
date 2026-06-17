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

function unwrapResponsePayload(payload) {
  if (payload && typeof payload === 'object' && 'success' in payload) {
    if (payload.success === false) {
      throw new Error(payload.message || 'API request failed');
    }
    return payload.data ?? payload;
  }

  return payload;
}

function unwrapCollectionResponse(payload) {
  const data = unwrapResponsePayload(payload) || {};
  const meta = payload?.meta || {};

  return {
    ...data,
    nextCursor: meta.nextCursor ?? data.nextCursor ?? null,
    totalCount: meta.totalCount ?? meta.count ?? data.totalCount ?? data.images?.length ?? 0,
  };
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
  let allImages = JSON.parse(localStorage.getItem('mock_images') || '[]');
  if (allImages.length === 0) {
    allImages = [
      {
        imageId: 'img_seed_1',
        userId: userId || 'user_mock_id',
        originalKey: 'users/mock/original/img_seed_1_sunset.jpg',
        thumbnailUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=600&q=80',
        resizedUrl: 'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1200&q=80',
        originalFilename: 'sunset_beach.jpg',
        mimeType: 'image/jpeg',
        fileSize: 102450,
        dimensions: { width: 1200, height: 800 },
        status: 'COMPLETED',
        moderationStatus: 'SAFE',
        visibility: 'PUBLIC',
        createdAt: new Date(Date.now() - 3600000).toISOString(),
        aiTags: [
          { name: 'Ocean', confidence: 98.5 },
          { name: 'Sunset', confidence: 95.2 },
          { name: 'Beach', confidence: 91.0 }
        ],
        exifData: {
          camera: 'Fujifilm X-T5',
          focalLength: '35mm',
          iso: 200,
          gps: { lat: 21.0285, lng: 105.8542 }
        },
        moderationLabels: []
      }
    ];
    saveMockImages(allImages);
  }
  const session = JSON.parse(localStorage.getItem('mock_session') || '{}');
  if (session.role === 'admin') {
    return allImages;
  }
  return allImages.filter((img) => img.userId === userId || img.userId === 'user_mock_id');
}

function saveMockImages(images) {
  localStorage.setItem('mock_images', JSON.stringify(images));
}

// Simulate backend processing pipeline
function runMockProcessing(imageId, userId, imageFile) {
  setTimeout(async () => {
    try {
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
      
      try { saveMockImages(images); } catch(e) {}

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

      try { saveMockImages(latestImages); } catch(e) {}
      window.dispatchEvent(new CustomEvent('mock-image-updated', { detail: { imageId } }));
    } catch (error) {
      console.error('runMockProcessing failed:', error);
    }
  }, 1500);
}

export const apiService = {
  // --- Profile ---
  async getProfile() {
    if (authService.isDemoMode()) {
      await mockDelay(200);
      const session = JSON.parse(localStorage.getItem('mock_session') || '{}');
      return {
        userId: session.userId || null,
        email: session.email || null,
        displayName: session.name || '',
        phoneNumber: session.phoneNumber || null,
        avatarUrl: session.avatarUrl || null,
        avatarKey: session.avatarKey || null,
      };
    }

    return unwrapResponsePayload(await request('/v1/profile'));
  },

  async getAvatarPresignedUrl(filename, contentType, fileSize) {
    if (authService.isDemoMode()) {
      await mockDelay(200);
      const session = JSON.parse(localStorage.getItem('mock_session') || '{}');
      const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg';
      return {
        uploadUrl: 'mock://avatar-upload',
        avatarKey: `users/${session.userId || 'mock-user'}/avatar/img_${Math.random().toString(36).slice(2, 10)}.${ext}`,
        expiresIn: 900,
      };
    }

    return unwrapResponsePayload(await request('/v1/profile/avatar/presigned-url', {
      method: 'POST',
      body: JSON.stringify({ filename, contentType, fileSize }),
    }));
  },

  async uploadAvatarToS3(uploadUrl, file, onProgress, signal) {
    if (authService.isDemoMode()) {
      for (let i = 15; i <= 100; i += 20) {
        if (signal?.aborted) throw new Error('AbortError');
        await mockDelay(120);
        if (onProgress) onProgress(i);
      }

      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Failed to read avatar file'));
        reader.onloadend = () => resolve(reader.result);
        reader.readAsDataURL(file);
      });
    }

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      if (signal) {
        signal.addEventListener('abort', () => {
          xhr.abort();
          reject(new Error('AbortError'));
        });
      }

      xhr.open('PUT', uploadUrl, true);
      xhr.setRequestHeader('Content-Type', file.type);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          onProgress(Math.round((e.loaded / e.total) * 100));
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve();
        } else {
          reject(new Error(`Avatar upload failed with status ${xhr.status}`));
        }
      };

      xhr.onerror = () => reject(new Error('Avatar upload network error'));
      xhr.send(file);
    });
  },

  async updateProfile(updates) {
    if (authService.isDemoMode()) {
      await mockDelay(250);
      const session = JSON.parse(localStorage.getItem('mock_session') || '{}');
      const next = {
        ...session,
        ...(updates.displayName ? { name: updates.displayName } : {}),
        ...(updates.avatarUrl !== undefined ? { avatarUrl: updates.avatarUrl } : {}),
        ...(updates.avatarKey !== undefined ? { avatarKey: updates.avatarKey } : {}),
        ...(updates.phoneNumber !== undefined ? { phoneNumber: updates.phoneNumber } : {}),
      };
      localStorage.setItem('mock_session', JSON.stringify(next));
      return {
        userId: next.userId,
        displayName: next.name,
        phoneNumber: next.phoneNumber || null,
        avatarUrl: next.avatarUrl || null,
        avatarKey: next.avatarKey || null,
      };
    }

    return unwrapResponsePayload(await request('/v1/profile', {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }));
  },

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

    return unwrapResponsePayload(await request('/v1/images/presigned-url', {
      method: 'POST',
      body: JSON.stringify({ filename, contentType, fileSize }),
    }));
  },

  // --- Upload to S3 (handles actual S3 or Mock upload) ---
  async uploadImageToS3(uploadUrl, fields, file, onProgress, signal) {
    if (authService.isDemoMode()) {
      // Simulate upload progress
      for (let i = 10; i <= 100; i += 20) {
        if (signal?.aborted) {
          throw new Error('AbortError');
        }
        await mockDelay(150);
        if (onProgress) onProgress(i);
      }

      if (signal?.aborted) {
        throw new Error('AbortError');
      }

      const session = await authService.getCurrentUser();
      // Extract imageId from key format: users/mock/original/img_XXXXXXX_filename
      const keyFilename = fields.key.split('/').pop();
      const imageId = keyFilename.split('_').slice(0, 2).join('_'); // "img_XXXXXXX"

      // Read file as Base64 to persist across page reloads in Demo Mode
      const reader = new FileReader();
      reader.readAsDataURL(file);

      return new Promise((resolve, reject) => {
        reader.onerror = () => reject(new Error('Failed to read file'));
        
        reader.onloadend = async () => {
          try {
            if (signal?.aborted) {
              reject(new Error('AbortError'));
              return;
            }

            const imageUrl = reader.result;

            const newImage = {
              imageId,
              userId: session.userId,
              originalKey: fields.key,
              thumbnailUrl: imageUrl,
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
            
            try {
              saveMockImages(images);
            } catch (storageError) {
              console.warn('LocalStorage quota exceeded or save failed. Trimming older images...', storageError);
              // If we hit the 5MB limit, keep only the latest 3 images to free up space
              const trimmedImages = images.slice(0, 3);
              saveMockImages(trimmedImages);
            }

            // Trigger local background processing
            runMockProcessing(imageId, session.userId, file);

            resolve({ imageId });
          } catch (err) {
            console.error('Mock upload processing error:', err);
            reject(err);
          }
        };
      });
    }

    // Real AWS S3 Upload — PUT with raw file body (matches PutObject presigned URL)
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      
      if (signal) {
        signal.addEventListener('abort', () => {
          xhr.abort();
          reject(new Error('AbortError'));
        });
      }

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
    return unwrapCollectionResponse(await request(url));
  },

  // --- List Public Images (works without authentication) ---
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

    // Public endpoint — does not require auth header
    let url = `/v1/images/public?limit=${limit}`;
    if (cursor) url += `&cursor=${encodeURIComponent(cursor)}`;
    
    const response = await fetch(`${API_BASE_URL}${url}`);
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Failed to fetch public images');
    }
    return unwrapCollectionResponse(await response.json());
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

    return unwrapResponsePayload(await request(`/v1/images/${imageId}`));
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

    return unwrapResponsePayload(await request(`/v1/images/${imageId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }));
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

    return unwrapResponsePayload(await request(`/v1/images/${imageId}`, {
      method: 'DELETE',
    }));
  },

  // --- Bulk Delete Images ---
  async bulkDeleteImages(imageIds) {
    if (authService.isDemoMode()) {
      await mockDelay(500);
      const allImages = JSON.parse(localStorage.getItem('mock_images') || '[]');
      const filtered = allImages.filter((img) => !imageIds.includes(img.imageId));
      saveMockImages(filtered);
      return { success: true, deletedCount: imageIds.length };
    }

    return unwrapResponsePayload(await request(`/v1/images/bulk`, {
      method: 'DELETE',
      body: JSON.stringify({ imageIds }),
    }));
  },

  // --- Search by Tag ---
  async searchByTag(tag) {
    const session = await authService.getCurrentUser();
    if (authService.isDemoMode()) {
      await mockDelay(400);
      const allImages = JSON.parse(localStorage.getItem('mock_images') || '[]');
      
      // Lấy danh sách ảnh mà người dùng được phép xem: ảnh của chính họ HOẶC ảnh public
      const visibleImages = allImages.filter((img) => 
        session.role === 'admin' || img.userId === session.userId || img.visibility === 'PUBLIC'
      );
      
      const filtered = visibleImages.filter((img) =>
        img.aiTags?.some(t => t.name.toLowerCase() === tag.toLowerCase())
      );
      return {
        images: filtered,
        nextCursor: null,
        totalCount: filtered.length,
      };
    }

    return unwrapCollectionResponse(await request(`/v1/images/search?tag=${encodeURIComponent(tag)}`));
  },

  // --- Get Download URL (for actual private raw file downloading) ---
  async getDownloadUrl(imageId) {
    if (authService.isDemoMode()) {
      await mockDelay(200);
      const image = await this.getImage(imageId);
      return { downloadUrl: image.thumbnailUrl };
    }

    return unwrapResponsePayload(await request(`/v1/images/${imageId}/download`));
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

    return unwrapCollectionResponse(await request('/v1/admin/moderation'));
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

    return unwrapResponsePayload(await request(`/v1/admin/moderation/${imageId}`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    }));
  },
};
