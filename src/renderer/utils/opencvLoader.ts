/**
 * OpenCV.js Loader for Web Environment
 * Handles loading and initializing OpenCV.js in the browser
 */

declare global {
  interface Window {
    cv: any;
  }
}

let isOpenCVLoaded = false;
let loadPromise: Promise<any> | null = null;

export function loadOpenCV(): Promise<any> {
  // Return existing promise if already loading
  if (loadPromise) {
    return loadPromise;
  }

  // Return immediately if already loaded
  if (isOpenCVLoaded && window.cv) {
    return Promise.resolve(window.cv);
  }

  loadPromise = new Promise((resolve, reject) => {
    // Set a timeout to prevent hanging
    const timeoutId = setTimeout(() => {
      console.warn('[OpenCV] Loading timeout, proceeding without OpenCV');
      reject(new Error('OpenCV loading timeout'));
    }, 10000); // 10 second timeout

    try {
      // Create script element to load OpenCV.js
      const script = document.createElement('script');
      script.src = 'https://docs.opencv.org/4.8.0/opencv.js';
      script.async = true;

      script.onload = () => {
        console.log('[OpenCV] Script loaded, waiting for initialization...');
        
        // OpenCV.js needs time to initialize
        let attempts = 0;
        const maxAttempts = 50; // Max 5 seconds
        
        const checkOpenCV = () => {
          attempts++;
          if (window.cv && window.cv.Mat) {
            clearTimeout(timeoutId);
            console.log('[OpenCV] Initialized successfully');
            isOpenCVLoaded = true;
            resolve(window.cv);
          } else if (attempts >= maxAttempts) {
            clearTimeout(timeoutId);
            console.warn('[OpenCV] Initialization timeout');
            reject(new Error('OpenCV initialization timeout'));
          } else {
            setTimeout(checkOpenCV, 100);
          }
        };

        checkOpenCV();
      };

      script.onerror = (error) => {
        clearTimeout(timeoutId);
        console.error('[OpenCV] Failed to load script:', error);
        reject(new Error('Failed to load OpenCV.js'));
      };

      // Add to document
      document.head.appendChild(script);

    } catch (error) {
      clearTimeout(timeoutId);
      console.error('[OpenCV] Load error:', error);
      reject(error);
    }
  });

  return loadPromise;
}

export function isOpenCVReady(): boolean {
  return isOpenCVLoaded && window.cv && window.cv.Mat;
}

export function getOpenCV(): any {
  if (!isOpenCVReady()) {
    throw new Error('OpenCV.js not loaded. Call loadOpenCV() first.');
  }
  return window.cv;
}