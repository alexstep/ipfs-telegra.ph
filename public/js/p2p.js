document.addEventListener('DOMContentLoaded', function(){

	var urlarr = window.location.href.split('/')
		urlarr.pop()
		urlarr.pop()
	window.ipfs_gateway = urlarr.join('/')

	// IPFS
	window.ipfs = new IPFS();
	ipfs.setProvider({host: 'ipfs.infura.io', protocol:'https'})

	// Create ETH aсcount
	initWallet(function(){
		// var openkey = Wallet.getAddresses()[0]
		// document.getElementById('your_address').innerHTML = 'Your address: <a target="_blank" href="https://etherscan.io/address/'+openkey+'">'+openkey+'</a>'
	
		startApp()
	})

})


var quill = false;
var pageContent = false;
function startApp(){
	quill = initQuill();

	if (browser.mobile) {
	  $(document.body).addClass('mobile');
	}
	checkAuth()

	getPostByUrl()
}

function initWallet(callback){
	window.Wallet = false
	callback()
	return
	if (localStorage.LW_keystore) {
		window.Wallet = lightwallet.keystore.deserialize(JSON.parse(localStorage.LW_keystore))
		if (callback) { callback() };
		return
	}

	var seedPhrase = localStorage.seedPhrase ||  lightwallet.keystore.generateRandomSeed()
	var password   = localStorage.pass || '1234'
	
	localStorage.seedPhrase = seedPhrase
	localStorage.password = password
	
	lightwallet.keystore.createVault({
		password:   password,
		seedPhrase: seedPhrase,
	}, function (err, ks) {
		window.Wallet = ks 

		ks.keyFromPassword(password, function (err, pwDerivedKey) {
			if (err) throw err;

			// generate five new address/private key pairs
			// the corresponding private keys are also encrypted
			ks.generateNewAddress(pwDerivedKey, 1);
			var addr = ks.getAddresses();

			ks.passwordProvider = function (callback) {
			  var pw = prompt("Please enter password", "Password");
			  callback(null, pw);
			};

			localStorage.LW_keystore = JSON.stringify( ks.serialize() )
			
			if (callback) { callback() };
		});
	});
}


function getPostByUrl(){
  function renderPost(callback){
	  if (!window.location.hash || window.location.hash.substr(0,3)!='#p_') {
		callback()
		return
	  }

	  ipfs.catJSON( window.location.hash.substr(3), function(err, result){
		if (err) {
		  console.error('catJSON',err)
		  return
		}

		window.cur_post_author = result.author

		if (result.body) {
		  $('#_tl_editor').html( result.body );

		  $('.tl_article_buttons').remove()
		}
		callback()
	  })
  }
  
  renderPost(function(){
  	$('body').removeClass('loading')
  }) 

  window.addEventListener('hashchange', function(){
  	$('body').addClass('loading')
  	renderPost(function(){
  		$('body').removeClass('loading')

  	})
  }, false);
}


if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js')
}