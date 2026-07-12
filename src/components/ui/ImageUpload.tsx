'use client';

import { useCallback, useRef, useState } from 'react';
import { Upload, X, Image as ImageIcon } from 'lucide-react';

interface ImageUploadProps {
  value?: string;
  onChange: (dataUrl: string | undefined) => void;
  shape?: 'square' | 'circle';
  size?: number;
  label?: string;
}

export default function ImageUpload({ value, onChange, shape = 'square', size = 120, label }: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const handleFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      onChange(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, [onChange]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleClick = () => inputRef.current?.click();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const isCircle = shape === 'circle';
  const borderRadius = isCircle ? '50%' : 12;

  if (value) {
    return (
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <div
          style={{
            width: size, height: size, borderRadius,
            overflow: 'hidden', border: '2px solid var(--border)',
            cursor: 'pointer', position: 'relative',
          }}
          onClick={handleClick}
        >
          <img src={value} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{
            position: 'absolute', inset: 0,
            background: 'rgba(0,0,0,0.3)', opacity: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'opacity 0.2s', color: 'white', fontSize: 12, fontWeight: 600,
          }}
            onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
            onMouseLeave={e => (e.currentTarget.style.opacity = '0')}
          >
            <Upload size={20} />
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); onChange(undefined); }}
          style={{
            position: 'absolute', top: -6, right: -6,
            width: 22, height: 22, borderRadius: '50%',
            background: '#ef4444', color: 'white',
            border: '2px solid white', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 0,
          }}
        >
          <X size={12} />
        </button>
        <input ref={inputRef} type="file" accept="image/*" onChange={handleChange} style={{ display: 'none' }} />
      </div>
    );
  }

  return (
    <div
      onClick={handleClick}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      style={{
        width: isCircle ? size : '100%',
        height: isCircle ? size : size,
        borderRadius,
        border: `2px dashed ${isDragging ? '#3b82f6' : 'var(--border)'}`,
        background: isDragging ? 'rgba(59,130,246,0.05)' : 'var(--surface-hover)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 6, cursor: 'pointer', transition: 'all 0.2s',
        color: isDragging ? '#3b82f6' : 'var(--text-muted)',
      }}
    >
      <ImageIcon size={isCircle ? 20 : 24} />
      <span style={{ fontSize: 12, fontWeight: 500, textAlign: 'center', padding: '0 8px' }}>
        {label || (isCircle ? '📷' : '📷 Cliquer ou glisser une image')}
      </span>
      <input ref={inputRef} type="file" accept="image/*" onChange={handleChange} style={{ display: 'none' }} />
    </div>
  );
}
