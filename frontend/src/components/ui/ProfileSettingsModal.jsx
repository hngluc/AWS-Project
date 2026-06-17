import { useRef, useEffect, useMemo, useState } from 'react';
import { Camera, Upload } from 'lucide-react';
import { Modal } from './Modal';
import { Button } from './Button';
import { apiService } from '../../services/api';
import { authService } from '../../services/auth';
import { useToast } from '../../hooks/useToast';
import { useAuthStore } from '../../store/authStore';

const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_AVATAR_SIZE_BYTES = 5 * 1024 * 1024;

export const ProfileSettingsModal = ({ isOpen, onClose }) => {
  const [displayName, setDisplayName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [avatarKey, setAvatarKey] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef(null);

  const user = useAuthStore((state) => state.user);
  const updateUserProfile = useAuthStore((state) => state.updateUserProfile);
  const toast = useToast();

  const avatarFallback = useMemo(
    () => (displayName || user?.name || user?.email || '?').charAt(0).toUpperCase(),
    [displayName, user],
  );

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;

    const loadProfile = async () => {
      setLoadingProfile(true);
      try {
        const profile = await apiService.getProfile();
        if (cancelled) return;
        setDisplayName(profile.displayName || user?.name || '');
        setPhoneNumber(profile.phoneNumber || '');
        setAvatarUrl(profile.avatarUrl || user?.avatarUrl || '');
        setAvatarKey(profile.avatarKey || null);
      } catch (error) {
        if (!cancelled) {
          toast.error(error.message || 'Không thể tải dữ liệu profile');
        }
      } finally {
        if (!cancelled) {
          setLoadingProfile(false);
        }
      }
    };

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [isOpen, user?.name, user?.email, user?.avatarUrl]);

  const handleAvatarChange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!AVATAR_MIME_TYPES.includes(file.type)) {
      toast.error('Avatar chỉ hỗ trợ JPG, PNG hoặc WEBP');
      return;
    }

    if (file.size > MAX_AVATAR_SIZE_BYTES) {
      toast.error('Avatar vượt quá giới hạn 5MB');
      return;
    }

    setUploadingAvatar(true);
    setUploadProgress(0);

    try {
      const { uploadUrl, avatarKey: nextAvatarKey } = await apiService.getAvatarPresignedUrl(
        file.name,
        file.type,
        file.size,
      );

      const uploadResult = await apiService.uploadAvatarToS3(uploadUrl, file, setUploadProgress);
      // Fallback to local object URL for preview if uploadResult is empty (real AWS mode)
      const nextAvatarUrl = typeof uploadResult === 'string' ? uploadResult : URL.createObjectURL(file);

      setAvatarKey(nextAvatarKey);
      setAvatarUrl(nextAvatarUrl);
      toast.success('Tải avatar thành công');
    } catch (error) {
      toast.error(error.message || 'Tải avatar thất bại');
    } finally {
      setUploadingAvatar(false);
      event.target.value = '';
    }
  };

  const handleSave = async () => {
    const trimmedName = displayName.trim();
    if (trimmedName.length < 2 || trimmedName.length > 80) {
      toast.error('Tên hiển thị phải từ 2 đến 80 ký tự');
      return;
    }

    setSaving(true);
    try {
      // Only send avatarKey, do not send avatarUrl (S3 presigned URL) because it expires
      // and sending it in the body triggers AWS WAF rules blocking the request.
      const updates = {
        displayName: trimmedName,
        phoneNumber: phoneNumber.trim() || null,
        avatarKey: avatarKey || null,
      };
      await apiService.updateProfile(updates);
      
      // Update local context with the avatarUrl so the UI updates immediately
      const localUpdates = {
        ...updates,
        avatarUrl: avatarUrl || null,
      };
      authService.updateLocalProfile(localUpdates);
      updateUserProfile(localUpdates);
      
      toast.success('Cập nhật hồ sơ thành công');
      onClose();
    } catch (error) {
      toast.error(error.message || 'Cập nhật hồ sơ thất bại');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cài đặt hồ sơ">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          {avatarUrl ? (
            <img
              src={avatarUrl}
              alt="Avatar"
              style={{ width: '64px', height: '64px', borderRadius: 'var(--radius-full)', objectFit: 'cover', border: '1px solid var(--border-color)' }}
            />
          ) : (
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: 'var(--radius-full)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.1rem',
                fontWeight: 700,
              }}
            >
              {avatarFallback}
            </div>
          )}

          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={handleAvatarChange}
              disabled={uploadingAvatar || saving}
              style={{ display: 'none' }}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={uploadingAvatar || saving}
              icon={uploadingAvatar ? <Upload size={14} /> : <Camera size={14} />}
              onClick={() => fileInputRef.current?.click()}
            >
              {uploadingAvatar ? `Đang tải... ${uploadProgress}%` : 'Đổi avatar'}
            </Button>
          </div>
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="profile-display-name">Tên hiển thị</label>
          <input
            id="profile-display-name"
            className="form-input"
            value={displayName}
            maxLength={80}
            onChange={(e) => setDisplayName(e.target.value)}
            disabled={loadingProfile || saving}
            placeholder="Nhập tên hiển thị"
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="profile-phone">Số điện thoại</label>
          <input
            id="profile-phone"
            className="form-input"
            value={phoneNumber}
            maxLength={20}
            onChange={(e) => setPhoneNumber(e.target.value)}
            disabled={loadingProfile || saving}
            placeholder="+84..."
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
          <Button variant="ghost" onClick={onClose} disabled={saving || uploadingAvatar}>
            Hủy
          </Button>
          <Button onClick={handleSave} loading={saving} disabled={loadingProfile || uploadingAvatar}>
            Lưu thay đổi
          </Button>
        </div>
      </div>
    </Modal>
  );
};
