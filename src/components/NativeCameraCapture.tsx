'use client';

import { useState, useRef } from 'react';
import { Camera, Video, X, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface MediaItem {
  type: 'photo' | 'video';
  url: string;
  name: string;
}

export default function NativeCameraCapture() {
  const [captures, setCaptures] = useState<MediaItem[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleCapture = (type: 'photo' | 'video', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    setCaptures(prev => [...prev, { type, url, name: file.name }]);
    // Reset the input so the same file can be re-selected
    e.target.value = '';
  };

  const removeCapture = (index: number) => {
    setCaptures(prev => {
      const next = [...prev];
      URL.revokeObjectURL(next[index].url);
      next.splice(index, 1);
      return next;
    });
  };

  return (
    <div dir="rtl" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Hidden native inputs with capture attribute */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        style={{ display: 'none' }}
        onChange={(e) => handleCapture('photo', e)}
      />
      <input
        ref={videoInputRef}
        type="file"
        accept="video/*"
        capture="environment"
        className="hidden"
        style={{ display: 'none' }}
        onChange={(e) => handleCapture('video', e)}
      />

      {/* Capture Buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {/* Photo Button */}
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => photoInputRef.current?.click()}
          style={{
            padding: '28px 20px', borderRadius: 20,
            background: 'linear-gradient(135deg, #0e7490, #06b6d4)',
            border: '1px solid rgba(6,182,212,0.3)',
            color: 'white', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
            boxShadow: '0 8px 32px rgba(6,182,212,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
            transition: 'box-shadow 0.3s ease',
          }}
        >
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'rgba(255,255,255,0.15)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Camera size={28} />
          </div>
          <span style={{ fontSize: 16, fontWeight: 700 }}>التقاط صورة</span>
          <span style={{ fontSize: 12, opacity: 0.7 }}>الكاميرا الخلفية</span>
        </motion.button>

        {/* Video Button */}
        <motion.button
          whileHover={{ scale: 1.04 }}
          whileTap={{ scale: 0.97 }}
          onClick={() => videoInputRef.current?.click()}
          style={{
            padding: '28px 20px', borderRadius: 20,
            background: 'linear-gradient(135deg, #c2410c, #f97316)',
            border: '1px solid rgba(249,115,22,0.3)',
            color: 'white', cursor: 'pointer',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12,
            boxShadow: '0 8px 32px rgba(249,115,22,0.3), inset 0 1px 0 rgba(255,255,255,0.1)',
            transition: 'box-shadow 0.3s ease',
          }}
        >
          <div style={{
            width: 56, height: 56, borderRadius: 16,
            background: 'rgba(255,255,255,0.15)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Video size={28} />
          </div>
          <span style={{ fontSize: 16, fontWeight: 700 }}>تسجيل فيديو</span>
          <span style={{ fontSize: 12, opacity: 0.7 }}>الكاميرا الخلفية</span>
        </motion.button>
      </div>

      {/* Captured Media Previews */}
      <AnimatePresence mode="popLayout">
        {captures.map((item, idx) => (
          <motion.div
            key={item.url}
            initial={{ opacity: 0, scale: 0.85, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.85, y: -10 }}
            transition={{ type: 'spring', damping: 20, stiffness: 300 }}
            style={{
              position: 'relative', borderRadius: 16, overflow: 'hidden',
              background: 'rgba(255,255,255,0.05)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(255,255,255,0.1)',
              padding: 12,
              display: 'flex', alignItems: 'center', gap: 12,
            }}
          >
            {/* Thumbnail */}
            <div style={{
              width: 64, height: 64, borderRadius: 10, overflow: 'hidden',
              flexShrink: 0, background: '#1e293b',
            }}>
              {item.type === 'photo' ? (
                <img src={item.url} alt="captured" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <video src={item.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              )}
            </div>

            {/* Info */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <CheckCircle2 size={14} color="#22c55e" />
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  {item.type === 'photo' ? 'تم التقاط الصورة' : 'تم تسجيل الفيديو'}
                </span>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                {item.name}
              </span>
            </div>

            {/* Remove button */}
            <button
              onClick={() => removeCapture(idx)}
              style={{
                width: 32, height: 32, borderRadius: 8,
                background: 'rgba(239,68,68,0.15)', border: 'none',
                color: '#ef4444', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <X size={16} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
