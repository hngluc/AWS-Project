import React, { useEffect, useState } from 'react';
import { useAuthStore } from './store/authStore';
import { useImageStore } from './store/imageStore';
import { LoginForm } from './components/auth/LoginForm';
import { SignupForm } from './components/auth/SignupForm';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { Layout } from './components/layout/Layout';
import { ImageGrid } from './components/images/ImageGrid';
import { ImageUploader } from './components/images/ImageUploader';
import { ImageSearch } from './components/images/ImageSearch';
import { ImageDetail } from './components/images/ImageDetail';
import { ModerationQueue } from './components/images/ModerationQueue';
import { Modal } from './components/ui/Modal';
import { RefreshCw, Image as ImageIcon } from 'lucide-react';
import { Button } from './components/ui/Button';

function App() {
  const { isAuthenticated, initialize, isLoading, user } = useAuthStore();
  const { images, fetchImages, selectedImage, setSelectedImage } = useImageStore();
  
  const [authMode, setAuthMode] = useState('login'); // 'login' or 'signup'
  const [activeTab, setActiveTab] = useState('gallery'); // 'gallery', 'upload', 'search', 'moderation'

  // Initialize Auth
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Fetch Images on Login or Tab Switch
  useEffect(() => {
    if (isAuthenticated) {
      fetchImages();
    }
  }, [isAuthenticated, fetchImages]);

  // Listen to mock background worker event updates for live-refreshing the UI
  useEffect(() => {
    const handleMockUpdate = () => {
      fetchImages();
      // If the selected image is updated, fetch its details too
      if (selectedImage) {
        useImageStore.getState().fetchImageDetails(selectedImage.imageId);
      }
    };

    window.addEventListener('mock-image-updated', handleMockUpdate);
    return () => {
      window.removeEventListener('mock-image-updated', handleMockUpdate);
    };
  }, [fetchImages, selectedImage]);

  if (isLoading) {
    return (
      <div 
        style={{ 
          minHeight: '100vh', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          background: 'var(--bg-main)' 
        }}
      >
        <div className="animate-spin" style={{ width: '40px', height: '40px', border: '3px solid rgba(124,58,237,0.1)', borderTopColor: 'var(--primary)', borderRadius: '50%' }} />
      </div>
    );
  }

  // Guest Mode (Login / Signup Screens)
  if (!isAuthenticated) {
    return (
      <div 
        style={{ 
          minHeight: '100vh', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center', 
          background: 'var(--bg-main)',
          padding: '2rem',
          position: 'relative',
          overflow: 'hidden'
        }}
      >
        {/* Visual Glow Orbs */}
        <div style={{ position: 'absolute', width: '350px', height: '350px', background: 'var(--primary)', filter: 'blur(120px)', opacity: 0.15, top: '-50px', left: '-50px', borderRadius: '50%' }} />
        <div style={{ position: 'absolute', width: '300px', height: '300px', background: 'var(--secondary)', filter: 'blur(120px)', opacity: 0.15, bottom: '-50px', right: '-50px', borderRadius: '50%' }} />

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2.5rem' }}>
            <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-md)', background: 'linear-gradient(135deg, var(--primary) 0%, var(--secondary) 100%)', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', boxShadow: 'var(--glow-shadow)' }}>
              <ImageIcon size={24} color="white" />
            </div>
            <div style={{ textAlign: 'left' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: '800', letterSpacing: '-0.02em', margin: 0, color: '#fff' }}>SmartImage</h1>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Serverless Image Vault</span>
            </div>
          </div>

          {authMode === 'login' ? (
            <LoginForm onToggleMode={() => setAuthMode('signup')} />
          ) : (
            <SignupForm onToggleMode={() => setAuthMode('login')} />
          )}
        </div>
      </div>
    );
  }

  // Tab Header Mapper
  const getTabTitle = () => {
    switch (activeTab) {
      case 'upload':
        return 'Upload Raw Images';
      case 'search':
        return 'AI Tag Search Portal';
      case 'moderation':
        return 'Admin Moderation Queue';
      case 'gallery':
      default:
        return 'My Vault Gallery';
    }
  };

  return (
    <ProtectedRoute>
      <Layout activeTab={activeTab} onTabChange={setActiveTab} title={getTabTitle()}>
        
        {/* TAB 1: Gallery View */}
        {activeTab === 'gallery' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
                Manage your uploaded photographs, see automated EXIF extractions, and preview AI labels.
              </p>
              <Button 
                variant="secondary" 
                size="sm"
                onClick={fetchImages}
                icon={<RefreshCw size={14} />}
              >
                Refresh
              </Button>
            </div>
            
            <ImageGrid 
              images={images} 
              onImageClick={setSelectedImage} 
              isLoading={isLoading} 
            />
          </div>
        )}

        {/* TAB 2: Upload View */}
        {activeTab === 'upload' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', alignItems: 'center', marginTop: '2rem' }}>
            <ImageUploader />
          </div>
        )}

        {/* TAB 3: AI Tag Search View */}
        {activeTab === 'search' && (
          <ImageSearch onImageClick={setSelectedImage} />
        )}

        {/* TAB 4: Admin Moderation View */}
        {activeTab === 'moderation' && (
          <ModerationQueue />
        )}

        {/* Floating Detail Modal */}
        <Modal 
          isOpen={!!selectedImage} 
          onClose={() => setSelectedImage(null)}
          title="Image Insights & Controls"
        >
          {selectedImage && (
            <ImageDetail 
              image={selectedImage} 
              onClose={() => setSelectedImage(null)} 
            />
          )}
        </Modal>

      </Layout>
    </ProtectedRoute>
  );
}

export default App;
