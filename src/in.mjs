import cheerio from 'cheerio';
import fetch from 'node-fetch';
const userId = '7596993850408332';

async function getTopReviews() {
	try {
		const response = await fetch('https://www.123telugu.com/category/reviews/');
		const html = await response.text();
		const $ = cheerio.load(html);

		const freshReviews = [];

		$('.leading').each((i, elem) => {
			const titleElement = $(elem).find('.article-rel-wrapper a');
			const title = titleElement
				.text()
				.trim()
				.replace(/^Review :/, '')
				.trim();
			const link = titleElement.attr('href');

			if (i == 3) {
				return false;
			}
			if (title && link) {
				freshReviews.push({ title, link });
			}
		});
		console.log('fresh review collected');
		console.log(freshReviews);
		return freshReviews;
	} catch (error) {
		console.error('An error occurred while fetching reviews:', error);
		return [];
	}
}

async function getMovieReviewData(freshReviews) {
	console.log('Fetching movie review data');
	const movieData = [];
	for (const review of freshReviews) {
		const { title, link } = review;
		if (title.includes('FDFS')) {
			continue;
		}
		try {
			const response = await fetch(link);
			const html = await response.text();
			const $ = cheerio.load(html);

			const ratingstring = $('p span[style="color: #ff0000;"] strong').text().split(':')[1].trim().split(' ');

			const rating = ratingstring[0];
			const moviename = $('h4:contains("Movie Name : ")').text().replace('Movie Name :', '').trim();
			const date = $('p:contains("Release Date :")').text().replace('Release Date :', '').trim();
			const [day, year] = date.split(',');

			movieData.push({
				moviename,
				rating,
				year,
			});
		} catch (error) {
			console.error(`Error fetching data for "${title}":`, error);
		}
	}
	console.log(movieData);
	console.log('Details are collected');
	return movieData;
}

async function createThreadsPost({ moviename, rating, year }, token) {
	console.log('Creating post for movie:', moviename);
	const moviehastag = '#' + moviename;
	const tag = moviehastag.trim().replace(/\s|\./g, '');
	try {
		const params = new URLSearchParams({
			media_type: 'TEXT',
			text: `${tag} - ${rating}`,
			access_token: token,
		});

		const url = `https://graph.threads.net/v1.0/${userId}/threads?${params.toString()}`;
		const response = await fetch(url, { method: 'POST' });
		console.log('Container created');
		const { id } = await response.json();

		const publishUrl = `https://graph.threads.net/v1.0/${userId}/threads_publish?creation_id=${id}&access_token=${token}`;
		const publishResponse = await fetch(publishUrl, { method: 'POST' });

		console.log(await publishResponse.json());
	} catch (error) {
		console.error('Error publishing post:', error);
	}
}

async function storeAccessToken(token, expiresIn) {
	const expiry = Date.now() + expiresIn;
	const data = JSON.stringify({ token, expiry });

	await env.REVIEWS.put('access_token', data);
	console.log('Access token stored in KV');
}

async function getAccessToken(env) {
	const current_token = await env.REVIEWS.get('access_token');
	if (!current_token) {
		console.log('No token');
		return null;
	}

	const parsedData = JSON.parse(current_token);
	const timestampnow = Date.now();

	if (parsedData.expiry <= timestampnow) {
		console.log('Token expired');
		return refreshAccessToken(current_token);
	}

	return parsedData.token;
}

async function refreshAccessToken(currentToken) {
	try {
		const response = await fetch(`https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${currentToken}`);

		if (response.ok) {
			const data = await response.json();
			await storeAccessToken(data.access_token, data.expires_in);
			return data.access_token;
		} else {
			throw new Error(`Failed to refresh token. Status: ${response.status}`);
		}
	} catch (error) {
		console.error('Error refreshing access token:', error);
		throw error;
	}
}

async function run() {
	const freshReviews = await getTopReviews();
	if (freshReviews) {
		const data = await getMovieReviewData(freshReviews);
		console.log(data);
		const token =
			'THQWJXWG90MXYyemppME5hUFNXR0VhT0ctd0JTVGNMYWpCM2dIZA0JhZA1c0Y0dCR0wwNUJCU1RjbWkxRjNMNkcxZAkY0bWx4WXZAPUmdsSkpNUTJDb2M5Y3oxWXl3SV9zOE9peUJUWksydktjTy14OGdnZA0xtd3l4bjdNZAzM1UGQ3blk5aFc0Q1Jz';
		for (const movieData of data) {
			await new Promise((resolve) => setTimeout(resolve, 20000)); // Wait for 20 seconds
			await createThreadsPost(movieData, token);
		}
	}
}

// Main function to run the script
async function main() {
	try {
		await run();
		console.log('Script completed successfully');
	} catch (error) {
		console.error('An error occurred:', error);
	}
}

// Run the script
main();
