/**
 * OpenCV.js Loader
 * Loads OpenCV.js library dynamically
 */

declare global {
  interface Window {
    cv: any;
  }
}

let cvPromise: Promise<any> | null = null;

export async function loadOpenCV(): Promise<any> {
  if (cvPromise) return cvPromise;
  
  cvPromise = new Promise((resolve, reject) => {
    // Check if already loaded
    if (window.cv && window.cv.Mat) {
      console.log('[OpenCV Loader] Already loaded');
      resolve(window.cv);
      return;
    }
    
    // Create script element
    const script = document.createElement('script');
    script.async = true;
    
    // Use CDN fallback since we can't use require in renderer
    // We'll use the OpenCV.js CDN
    script.src = 'https://docs.opencv.org/4.5.5/opencv.js';
    
    // Set up handlers
    script.onload = () => {
      console.log('[OpenCV Loader] Script loaded, waiting for initialization...');
      
      // OpenCV.js uses Module pattern
      if (typeof window.cv !== 'undefined') {
        // Set up runtime initialized callback
        window.cv.onRuntimeInitialized = () => {
          console.log('[OpenCV Loader] OpenCV.js runtime initialized');
          resolve(window.cv);
        };
      } else {
        // Wait for cv to be ready
        const checkReady = setInterval(() => {
          if (window.cv && window.cv.Mat) {
            clearInterval(checkReady);
            console.log('[OpenCV Loader] OpenCV.js ready');
            resolve(window.cv);
          }
        }, 100);
        
        // Timeout after 10 seconds
        setTimeout(() => {
          clearInterval(checkReady);
          reject(new Error('OpenCV initialization timeout'));
        }, 10000);
      }
    };
    
    script.onerror = (error) => {
      console.error('[OpenCV Loader] Failed to load script:', error);
      reject(new Error('Failed to load OpenCV.js'));
    };
    
    // Add to document
    document.head.appendChild(script);
  });
  
  return cvPromise;
}