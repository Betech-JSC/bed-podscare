import React from 'react';
import { Icon } from '../atoms/Icons';
import type { DevicePhoto } from '@podscare/types';

export interface PhotoDropzoneProps {
  photos: DevicePhoto[];
  onChange: (photos: DevicePhoto[]) => void;
  label?: string;
  hint?: string;
  disabled?: boolean;
}

export const PhotoDropzone: React.FC<PhotoDropzoneProps> = ({
  photos,
  onChange,
  label = 'Thêm ảnh thiết bị',
  hint = 'Chọn ảnh từ thiết bị · có thể chọn nhiều ảnh',
  disabled = false,
}) => {
  const handleFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const newPhotos: DevicePhoto[] = Array.from(files).map((file) => ({
      name: file.name,
      url: URL.createObjectURL(file),
    }));
    onChange([...photos, ...newPhotos]);
  };

  const removePhoto = (index: number) => {
    const updated = [...photos];
    updated.splice(index, 1);
    onChange(updated);
  };

  return (
    <div className="w-full">
      <label
        className={`relative min-h-[105px] border border-dashed border-[#b7d2c3] rounded-[10px] bg-[#f7faf8] hover:bg-[#f1f8f3] hover:border-[#73a78b] flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-colors p-4 ${
          disabled ? 'opacity-60 cursor-not-allowed' : ''
        }`}
      >
        <span className="w-8 h-8 rounded-full bg-[#e7f2eb] text-[#176b58] grid place-items-center">
          <Icon name="plus" size={16} />
        </span>
        <b className="text-sm text-[#287452] font-semibold">{label}</b>
        <small className="text-xs text-[#85948d]">{hint}</small>
        <input
          type="file"
          accept="image/*"
          multiple
          disabled={disabled}
          onChange={(e) => handleFiles(e.target.files)}
          className="absolute inset-0 opacity-0 cursor-pointer disabled:cursor-not-allowed"
        />
      </label>

      {photos.length > 0 && (
        <div className="flex flex-wrap gap-2.5 mt-3">
          {photos.map((photo, i) => (
            <div
              key={`${photo.name}-${i}`}
              className="w-[90px] h-[82px] relative rounded-[8px] overflow-hidden bg-[#f0f3f1] border border-[#e5ece8] group"
            >
              <img
                src={photo.url}
                alt={photo.name}
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={() => removePhoto(i)}
                aria-label="Xóa ảnh"
                className="absolute right-1 top-1 rounded-full bg-[#17231f]/80 hover:bg-[#bc5b52] text-white w-5 h-5 flex items-center justify-center text-xs leading-none transition-colors"
              >
                ×
              </button>
              <small className="absolute bottom-0 inset-x-0 bg-[#17231f]/85 text-white text-xs px-1.5 py-0.5 truncate text-center">
                {photo.name}
              </small>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
