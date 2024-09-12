import fetch from 'node-fetch';

const url = 'https://graph.threads.net/oauth/access_token';

const formData = new URLSearchParams({
	client_id: '1244059503228121',
	client_secret: '235ad00b13778dfb7c295ac354c5034d',
	grant_type: 'authorization_code',
	redirect_uri: 'https://oauth.pstmn.io/v1/callback',
	code: 'AQAEr4-cdh0zb9Poq6omMVCOh0I1CAmGmWlZRb2R8e4rztJQELyBQPQrU-3SOBeyQv5fNGtCjBfLEMBz6Hq7kDAjtuswM_dmJaTSpxvSr42TWV48MOdYkRR20JVHXgs3150RQ1ZaB6cQun5pj_97fBMh0OfW7aXS3G1Ktbpre0SJsmP9ngbwkTLUHpwDLx2JDLKp2EcCUzPFaJKPJzU7YfTj9HmBipHJM7ir-HR2XpcGOQ',
});

fetch(url, {
	method: 'POST',
	headers: {
		'Content-Type': 'application/x-www-form-urlencoded',
	},
	body: formData.toString(),
})
	.then((response) => response.json())
	.then((data) => console.log(data))
	.catch((error) => console.error('Error:', error));
