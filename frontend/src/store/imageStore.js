import { create } from 'zustand';
import { apiService } from '../services/api';

const abortControllers = new Map();

export const useImageStore = create((set, get) => ({
  images: [],
  publicImages: [],
  moderationQueue: [],
  selectedImage: null,
  isLoading: false,
  uploadingFiles: {}, // Keyed by file name: { progress, status, error }
  error: null,
  activeTag: '',
  searchResult: null,

  fetchImages: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiService.listImages();
      set({ 
        images: response.images, 
        isLoading: false,
        activeTag: '',
        searchResult: null
      });
    } catch (error) {
      set({ isLoading: false, error: error.message });
    }
  },

  fetchPublicImages: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiService.getPublicImages();
      set({ 
        publicImages: response.images, 
        isLoading: false,
        activeTag: '',
        searchResult: null
      });
    } catch (error) {
      set({ isLoading: false, error: error.message });
    }
  },

  fetchImageDetails: async (imageId) => {
    set({ isLoading: true, error: null });
    try {
      const image = await apiService.getImage(imageId);
      set({ selectedImage: image, isLoading: false });
      return image;
    } catch (error) {
      set({ isLoading: false, error: error.message });
      throw error;
    }
  },

  uploadImage: async (file) => {
    const fileName = file.name;
    
    // 1. Initialize upload status
    set((state) => ({
      uploadingFiles: {
        ...state.uploadingFiles,
        [fileName]: { progress: 0, status: 'UPLOADING', error: null },
      },
    }));

    try {
      // 2. Get Presigned URL
      const { imageId, uploadUrl, fields } = await apiService.getPresignedUrl(
        file.name,
        file.type,
        file.size
      );

      const controller = new AbortController();
      abortControllers.set(fileName, controller);

      // 3. Perform direct S3 or Mock upload
      await apiService.uploadImageToS3(uploadUrl, fields, file, (progress) => {
        set((state) => ({
          uploadingFiles: {
            ...state.uploadingFiles,
            [fileName]: { ...state.uploadingFiles[fileName], progress },
          },
        }));
      }, controller.signal);

      abortControllers.delete(fileName);

      // 4. Update status to PROCESSING (Lambda trigger begins)
      set((state) => ({
        uploadingFiles: {
          ...state.uploadingFiles,
          [fileName]: { progress: 100, status: 'PROCESSING', error: null },
        },
      }));

      // In real S3, we wait for DynamoDB to update via polling or user refresh.
      // In Mock Mode, a custom event is fired when simulated Lambda is done.
      // Let's refresh image list immediately for Demo/Mock mode or poll:
      await get().fetchImages();

      // Clean up progress indicator after delay
      setTimeout(() => {
        set((state) => {
          const nextUploads = { ...state.uploadingFiles };
          delete nextUploads[fileName];
          return { uploadingFiles: nextUploads };
        });
      }, 5000);

      return imageId;
    } catch (error) {
      abortControllers.delete(fileName);
      
      const isCanceled = error.name === 'AbortError' || error.message === 'AbortError';
      
      set((state) => ({
        uploadingFiles: {
          ...state.uploadingFiles,
          [fileName]: { 
            progress: isCanceled ? state.uploadingFiles[fileName]?.progress || 0 : 0, 
            status: isCanceled ? 'CANCELED' : 'FAILED', 
            error: isCanceled ? 'Upload canceled' : error.message 
          },
        },
      }));

      // If canceled, clean it up after a few seconds too
      if (isCanceled) {
        setTimeout(() => {
          set((state) => {
            const nextUploads = { ...state.uploadingFiles };
            delete nextUploads[fileName];
            return { uploadingFiles: nextUploads };
          });
        }, 3000);
      }

      throw error;
    }
  },

  cancelUpload: (fileName) => {
    const controller = abortControllers.get(fileName);
    if (controller) {
      controller.abort();
      abortControllers.delete(fileName);
    }
  },

  deleteImage: async (imageId) => {
    set({ isLoading: true, error: null });
    try {
      await apiService.deleteImage(imageId);
      set((state) => ({
        images: state.images.filter((img) => img.imageId !== imageId),
        selectedImage: state.selectedImage?.imageId === imageId ? null : state.selectedImage,
        isLoading: false,
      }));
    } catch (error) {
      set({ isLoading: false, error: error.message });
      throw error;
    }
  },

  bulkDeleteImages: async (imageIds) => {
    set({ isLoading: true, error: null });
    try {
      await apiService.bulkDeleteImages(imageIds);
      set((state) => ({
        images: state.images.filter((img) => !imageIds.includes(img.imageId)),
        selectedImage: state.selectedImage && imageIds.includes(state.selectedImage.imageId) ? null : state.selectedImage,
        isLoading: false,
      }));
    } catch (error) {
      set({ isLoading: false, error: error.message });
      throw error;
    }
  },

  updateImageMetadata: async (imageId, updates) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await apiService.updateImage(imageId, updates);
      set((state) => ({
        images: state.images.map((img) => img.imageId === imageId ? { ...img, ...updates } : img),
        selectedImage: state.selectedImage?.imageId === imageId ? { ...state.selectedImage, ...updates } : state.selectedImage,
        isLoading: false,
      }));
      return updated;
    } catch (error) {
      set({ isLoading: false, error: error.message });
      throw error;
    }
  },

  searchByTag: async (tag) => {
    if (!tag) {
      get().fetchImages();
      return;
    }

    set({ isLoading: true, error: null, activeTag: tag });
    try {
      const response = await apiService.searchByTag(tag);
      set({ 
        searchResult: response.images, 
        isLoading: false 
      });
    } catch (error) {
      set({ isLoading: false, error: error.message });
    }
  },

  fetchModerationQueue: async () => {
    set({ isLoading: true, error: null });
    try {
      const response = await apiService.getModerationQueue();
      set({ moderationQueue: response.images, isLoading: false });
    } catch (error) {
      set({ isLoading: false, error: error.message });
    }
  },

  moderateImage: async (imageId, action) => {
    set({ isLoading: true, error: null });
    try {
      await apiService.moderateImage(imageId, action);
      set((state) => ({
        moderationQueue: state.moderationQueue.filter((img) => img.imageId !== imageId),
        images: state.images.map((img) => {
          if (img.imageId === imageId) {
            return {
              ...img,
              moderationStatus: action === 'APPROVE' ? 'SAFE' : 'REJECTED',
              moderationLabels: action === 'APPROVE' ? [] : img.moderationLabels
            };
          }
          return img;
        }),
        selectedImage: state.selectedImage?.imageId === imageId ? {
          ...state.selectedImage,
          moderationStatus: action === 'APPROVE' ? 'SAFE' : 'REJECTED',
          moderationLabels: action === 'APPROVE' ? [] : state.selectedImage.moderationLabels
        } : state.selectedImage,
        isLoading: false,
      }));
    } catch (error) {
      set({ isLoading: false, error: error.message });
      throw error;
    }
  },

  setSelectedImage: (image) => set({ selectedImage: image }),
}));
