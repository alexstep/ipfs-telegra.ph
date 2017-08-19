document.addEventListener('DOMContentLoaded', function(){
	var urlarr = window.location.href.split('/')
		urlarr.pop()
		urlarr.pop()
	
	window.ipfs_gateway = urlarr.join('/')
	if (window.ipfs_gateway.length < 10) {
		window.ipfs_gateway = 'https://ipfs.io/ipfs/'
	}

	// IPFS
	window.ipfs = new IPFS();
	ipfs.setProvider({host: 'ipfs.infura.io', protocol:'https'})
	
	window.save2IPFS = function(d, c) {
		ipfs.add(d,c)
	}

	initView()
})


function initView(){
	window.pageContent = false;
	window.quill       = initQuill();

	if (browser.mobile) {
	  $(document.body).addClass('mobile');
	}

	startTelegraph()

	$('body').removeClass('loading')
}


if ('serviceWorker' in navigator) {
	navigator.serviceWorker.register('./sw.js')
}