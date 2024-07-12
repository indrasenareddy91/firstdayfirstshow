import cheerio from 'cheerio';

const userId = '7596993850408332';
import { AutoRouter } from 'itty-router';
const router = AutoRouter();

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
			var WebSeries = false;
			if (title.includes('series') || title.includes('show') || title.includes('OTT')) {
				WebSeries = true;
			}
			if (i == 3) {
				return false;
			}
			if (title && link) {
				freshReviews.push({ title, link, WebSeries });
			}
		});
		console.log('fresh review collected');
		return freshReviews;
	} catch (error) {
		console.error('An error occurred while fetching reviews:', error);
		return [];
	}
}

async function updateDatabase(freshReviews, env) {
	console.log('Updating database using Workers KV');

	for (let i = freshReviews.length - 1; i >= 0; i--) {
		const review = freshReviews[i];

		const key = new URL(review.link).pathname;

		const existingReview = await env.REVIEWS.get(key);

		if (existingReview) {
			console.log(`Review already exists: ${review.title}`);
			freshReviews.splice(i, 1);
		}
	}

	if (freshReviews.length > 0) {
		// Add new reviews to KV
		console.log(freshReviews);
		const addPromises = freshReviews.map((review) => env.REVIEWS.put(new URL(review.link).pathname, JSON.stringify(review)));

		await Promise.all(addPromises);
		console.log(`${freshReviews.length} new reviews added to the database`);
	} else {
		console.log('No new reviews to add');
	}

	return freshReviews;
}
async function getMovieReviewData(freshReviews) {
	const movieData = [];
	for (const review of freshReviews) {
		const { title, link, WebSeries } = review;

		try {
			const response = await fetch(link);
			const html = await response.text();
			const $ = cheerio.load(html);

			const ratingstring = $('p span[style="color: #ff0000;"] strong').text().split(':')[1].trim().split(' ');

			const rating = ratingstring[0];
			const releaseDate = $('p:contains("Release Date :")').text().replace('Release Date :', '').trim();

			const parts = title.split(/\s*[-–]\s*/);
			var titlee, revieww;
			if (!WebSeries) {
				titlee = parts[0].trim();
				revieww = parts[1].trim();
			} else {
				titlee = parts[0].trim();
				revieww = '';
			}
			movieData.push({
				titlee,
				rating,
				revieww,
			});
		} catch (error) {
			console.error(`Error fetching data for "${title}":`, error);
		}
	}
	console.log('details are collected');
	return movieData;
}

async function createThreadsPost({ titlee, revieww, rating }, token) {
	const tag = titlee.replace(' ', '');
	var review;
	if (revieww) {
		review = '- ' + revieww;
	} else {
		review = '';
	}
	const moviehastag = '#' + tag;
	try {
		const params = new URLSearchParams({
			media_type: 'TEXT',
			text: `${moviehastag} - ${rating}`,
			access_token: token,
		});

		const url = `https://graph.threads.net/v1.0/${userId}/threads?${params.toString()}`;
		const response = await fetch(url, { method: 'POST' });
		console.log('container created');
		const { id } = await response.json();

		const publishUrl = `https://graph.threads.net/v1.0/${userId}/threads_publish?creation_id=${id}&access_token=${token}`;
		const publishResponse = await fetch(publishUrl, { method: 'POST' });

		console.log(await publishResponse.json());
	} catch (error) {
		console.error('Error publishing post:', error);
	}
}
async function storeAccessToken(token, expiresIn) {
	const expiry = Date.now() + expiresIn; // Convert to milliseconds and add current timestamp
	const data = JSON.stringify({ token, expiry }); // Store token and expiry time as a single value

	await kv.put('access_token', data);
	console.log(' ok ! Access token stored in KV');
}

async function getAccessToken(env) {
	const current_token = await env.REVIEWS.get('access_token');
	if (!current_token) {
		console.log('no token');
		return null;
	}

	const parsedData = JSON.parse(current_token);
	const timestampnow = Date.now();

	if (parsedData.expiry <= timestampnow) {
		console.log('token expired');
		return refreshAccessToken(current_token);
	}

	return parsedData.token;
}
async function refreshAccessToken(currentToken) {
	try {
		const response = await fetch(`https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${currentToken}`);

		if (response.ok) {
			const data = await response.json();
			storeAccessToken(data.access_token, data.expires_in);
			return data.access_token;
		} else {
			throw new Error(`Failed to refresh token. Status: ${response.status}`);
		}
	} catch (error) {
		console.error('Error refreshing access token:', error);
		throw error;
	}
}
export default {
	fetch: router.fetch,
	scheduled: async (event, env, ctx) => {
		const freshReviews = await getTopReviews();
		const updatedReviews = await updateDatabase(freshReviews, env);
		const data = await getMovieReviewData(updatedReviews);
		const token = await getAccessToken(env);
		for (const movieData of data) {
			await new Promise((resolve) => setTimeout(resolve, 20000)); // Wait for 20 seconds
			await createThreadsPost(movieData, token);
		}
		console.log('Cron job completed');
	},
};

router.get('/', async (event, env, ctx) => {
	const freshReviews = await getTopReviews();
	const updatedReviews = await updateDatabase(freshReviews, env);
	const data = await getMovieReviewData(updatedReviews);
	const token = await getAccessToken(env);
	for (const movieData of data) {
		await new Promise((resolve) => setTimeout(resolve, 20000)); // Wait for 20 seconds
		await createThreadsPost(movieData, token);
	}

	return 'success';
});
