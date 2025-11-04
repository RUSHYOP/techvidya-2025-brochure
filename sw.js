// Service Worker for aggressive PDF caching and optimization
const CACHE_NAME = 'techvidya-pdf-v1';
const PDF_URL = 'https://pub-01b86a07b6904467a8a45ae0ec6c8c9e.r2.dev/TechVidya-Brochure.pdf';

// Critical resources to cache immediately
const CRITICAL_RESOURCES = [
    '/',
    '/index.html',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js',
    'https://fonts.googleapis.com/css2?family=Oswald:wght@200..700&display=swap'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Pre-caching critical resources');
                return cache.addAll(CRITICAL_RESOURCES);
            })
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames
                    .filter(cacheName => cacheName !== CACHE_NAME)
                    .map(cacheName => caches.delete(cacheName))
            );
        }).then(() => self.clients.claim())
    );
});

// Handle PDF range requests for progressive loading
self.addEventListener('fetch', event => {
    const url = event.request.url;
    
    // Handle PDF requests with range support
    if (url === PDF_URL) {
        event.respondWith(handlePDFRequest(event.request));
        return;
    }
    
    // Cache-first strategy for other resources
    event.respondWith(
        caches.match(event.request)
            .then(cachedResponse => {
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                return fetch(event.request).then(response => {
                    // Don't cache range requests or failed responses
                    if (response.status !== 200 || event.request.headers.get('range')) {
                        return response;
                    }
                    
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                    
                    return response;
                });
            })
    );
});

async function handlePDFRequest(request) {
    const cache = await caches.open(CACHE_NAME);
    const rangeHeader = request.headers.get('range');
    
    // If it's a range request, handle it specially
    if (rangeHeader) {
        try {
            // Try to get from network first for range requests
            const response = await fetch(request);
            return response;
        } catch (error) {
            console.warn('Range request failed, falling back to cache:', error);
        }
    }
    
    // Check cache first
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }
    
    // Fetch and cache the full PDF
    try {
        const response = await fetch(request);
        if (response.status === 200) {
            cache.put(request, response.clone());
        }
        return response;
    } catch (error) {
        console.error('Failed to fetch PDF:', error);
        throw error;
    }
}

// Handle background sync for prefetching
self.addEventListener('sync', event => {
    if (event.tag === 'prefetch-pdf') {
        event.waitUntil(prefetchPDF());
    }
});

async function prefetchPDF() {
    try {
        const cache = await caches.open(CACHE_NAME);
        const cachedPDF = await cache.match(PDF_URL);
        
        if (!cachedPDF) {
            console.log('Prefetching PDF...');
            const response = await fetch(PDF_URL);
            if (response.status === 200) {
                await cache.put(PDF_URL, response);
                console.log('PDF prefetched and cached');
            }
        }
    } catch (error) {
        console.error('Failed to prefetch PDF:', error);
    }
}
