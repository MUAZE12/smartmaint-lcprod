'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function SplashScreen() {
  const [visible, setVisible] = useState(true);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          return 100;
        }
        return prev + 4;
      });
    }, 60);

    const timer = setTimeout(() => {
      setVisible(false);
    }, 2800);

    return () => {
      clearInterval(interval);
      clearTimeout(timer);
    };
  }, []);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, y: -30, scale: 1.05 }}
          transition={{ duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0a0f1e 0%, #0f172a 40%, #0a0f1e 100%)',
            overflow: 'hidden',
          }}
        >
          {/* Background grid */}
          <div style={{
            position: 'absolute', inset: 0, opacity: 0.04,
            backgroundImage: 'linear-gradient(rgba(6,182,212,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(6,182,212,0.3) 1px, transparent 1px)',
            backgroundSize: '60px 60px',
          }} />

          {/* Radial glow behind logo */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 1.2, ease: 'easeOut' }}
            style={{
              position: 'absolute', width: 500, height: 500, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(6,182,212,0.12) 0%, transparent 65%)',
            }}
          />

          {/* Rotating outer gear ring decoration */}
          <motion.div
            initial={{ rotate: -180, opacity: 0 }}
            animate={{ rotate: 0, opacity: 0.06 }}
            transition={{ duration: 2, type: 'spring', damping: 25, stiffness: 80 }}
            style={{
              position: 'absolute', width: 320, height: 320, borderRadius: '50%',
              border: '3px dashed rgba(6,182,212,0.4)',
            }}
          />

          {/* Logo container with mechanical animation */}
          <motion.div
            initial={{ scale: 0, rotate: -90, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{
              type: 'spring',
              damping: 15,
              stiffness: 100,
              mass: 1.5,
              delay: 0.2,
            }}
            style={{
              width: 130, height: 130, borderRadius: 28,
              background: 'rgba(255,255,255,0.03)',
              backdropFilter: 'blur(20px)',
              border: '1px solid rgba(6,182,212,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginBottom: 28,
              position: 'relative',
            }}
          >
            {/* Glow pulse behind logo */}
            <motion.div
              animate={{
                boxShadow: [
                  '0 0 20px rgba(6,182,212,0.2), 0 0 60px rgba(6,182,212,0.05)',
                  '0 0 40px rgba(6,182,212,0.4), 0 0 80px rgba(6,182,212,0.1)',
                  '0 0 20px rgba(6,182,212,0.2), 0 0 60px rgba(6,182,212,0.05)',
                ],
              }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                position: 'absolute', inset: 0, borderRadius: 28,
              }}
            />
            <motion.img
              src="/logo.png"
              alt="SmartMaint — L.C PROD"
              initial={{ opacity: 0, scale: 0.82 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.9, delay: 0.4, ease: 'easeOut' }}
              style={{ width: 104, height: 104, objectFit: 'contain', borderRadius: 18 }}
            />
          </motion.div>

          {/* Title — draws in */}
          <motion.h1
            initial={{ y: 30, opacity: 0, letterSpacing: '0.3em' }}
            animate={{ y: 0, opacity: 1, letterSpacing: '-0.03em' }}
            transition={{ delay: 0.6, duration: 0.8, type: 'spring', damping: 20, stiffness: 100 }}
            style={{
              fontSize: 38, fontWeight: 800,
              background: 'linear-gradient(135deg, #ffffff 0%, #67e8f9 50%, #06b6d4 100%)',
              WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
              marginBottom: 8,
            }}
          >
            SmartMaint
          </motion.h1>

          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.9, duration: 0.5 }}
            style={{
              fontSize: 14, color: '#64748b', fontWeight: 500,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              marginBottom: 48,
            }}
          >
L.C PROD · GMAO Agroalimentaire 4.0
          </motion.p>

          {/* Progress bar */}
          <motion.div
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 280, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            style={{
              height: 4, borderRadius: 100,
              background: 'rgba(255,255,255,0.06)',
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <motion.div
              style={{
                height: '100%', borderRadius: 100,
                background: 'linear-gradient(90deg, #06b6d4, #22d3ee, #06b6d4)',
                backgroundSize: '200% 100%',
                animation: 'shimmer 1.5s infinite',
                width: `${progress}%`,
                transition: 'width 0.1s ease',
                boxShadow: '0 0 12px rgba(6,182,212,0.5)',
              }}
            />
          </motion.div>

          {/* Loading text */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
            style={{
              marginTop: 16, fontSize: 12, color: '#475569',
              fontWeight: 500,
            }}
          >
            {progress < 30 ? 'Initialisation des modules…' : progress < 60 ? 'Chargement des données usine…' : progress < 90 ? 'Connexion aux ateliers…' : 'Prêt'}
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
