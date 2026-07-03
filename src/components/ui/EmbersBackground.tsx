'use client';

import React, { useEffect, useRef } from 'react';
import styles from './EmbersBackground.module.css';

interface Particle {
  x: number;
  y: number;
  size: number;
  speedY: number;
  speedX: number;
  opacity: number;
}

export default function EmbersBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const particles: Particle[] = [];
    let animationFrameId: number;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    
    // Initialize canvas size
    resize();
    window.addEventListener('resize', resize);

    const createParticle = (): Particle => {
      return {
        x: Math.random() * canvas.width,
        y: canvas.height + 10,
        size: Math.random() * 3 + 1,
        speedY: Math.random() * 1.5 + 0.5,
        speedX: (Math.random() - 0.5) * 1.5,
        opacity: Math.random() * 0.8 + 0.2
      };
    };

    // Initial particles
    for (let i = 0; i < 40; i++) {
      particles.push({
        ...createParticle(),
        y: Math.random() * canvas.height
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        
        // Embers are a glowing orange/red
        ctx.fillStyle = `rgba(217, 119, 6, ${p.opacity})`;
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#991b1b'; // red ember glow
        
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();

        // Move particle up and drift sideways
        p.y -= p.speedY;
        p.x += p.speedX;
        
        // Randomly change sideways drift slightly for a natural "drifting" feel
        p.speedX += (Math.random() - 0.5) * 0.1;
        
        // Fade out as they go up
        p.opacity -= 0.002;

        // Reset if offscreen or faded
        if (p.y < -10 || p.opacity <= 0) {
          particles[i] = createParticle();
        }
      }
      
      animationFrameId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas 
      ref={canvasRef} 
      className={styles.canvasContainer}
      aria-hidden="true"
    />
  );
}
