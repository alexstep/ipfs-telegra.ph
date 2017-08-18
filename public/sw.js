var version = 'v1::3';

var files = [
	'/',
	'/index.html',
	'./',
	'./images/icons.png',
	'./images/icons_2x.png',

	'./css/core.css',
	'./css/quill.core.css',
	'./css/fonts.css',

	'./js/autosize.min.js',
	'./js/cachep2p.min.js',
	'./js/core.js',
	'./js/ipfs-mini.min.js',
	'./js/jquery.min.js',
	'./js/jquery.selection.min.js',
	'./js/load-image.all.min.js',
	'./js/p2p.js',
	'./js/post_template.js',
	'./js/quill.js',
	'./sw.js',
]

self.addEventListener("install", function(event) {
  event.waitUntil(
    caches.open(version + 'fundamentals').then(function(cache) { return cache.addAll(files); })
  );
});


self.addEventListener("fetch", function(event) {

  if (event.request.method !== 'GET') {
    return;
  }
 
  event.respondWith(
    caches.match(event.request).then(function(cached) {

        var networked = fetch(event.request)
          .then(fetchedFromNetwork, unableToResolve)
          .catch(unableToResolve);

        return cached || networked;

        function fetchedFromNetwork(response) {
          var cacheCopy = response.clone();

          caches.open(version + 'pages').then(function add(cache) {
          	cache.put(event.request, cacheCopy);
          }).then(function() { });

          return response;
        }


        function unableToResolve () {
          return new Response('<h1>Service Unavailable</h1>', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({
              'Content-Type': 'text/html'
            })
          });
        }
      })
  );
});