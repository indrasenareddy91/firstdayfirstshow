import cheerio from 'cheerio';
import { AutoRouter } from 'itty-router';
const router = AutoRouter();
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
	console.log('hello');
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
			console.log(moviename);
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
	console.log('details are collected');
	return movieData;
}

async function createThreadsPost({ moviename, rating, year }, token) {
	console.log('moviecreated');
	console.log(moviename);
	const moviehastag = '#' + moviename;
	const tag = moviehastag.trim().replace(/\s|\./g, '');

	try {
		const params = new URLSearchParams({
			media_type: 'TEXT',
			text: `${tag.toLowerCase()} - ${rating}`,
			access_token: token,
		});

		const url = `https://graph.threads.net/v1.0/${userId}/threads?${params.toString()}`;
		const response = await fetch(url, { method: 'POST' });
		console.log('container created');
		const { id } = await response.json();
		console.log(id);
		const publishUrl = `https://graph.threads.net/v1.0/${userId}/threads_publish?creation_id=${id}&access_token=${token}`;
		const publishResponse = await fetch(publishUrl, { method: 'POST' });

		console.log(await publishResponse.json());
	} catch (error) {
		console.error('Error publishing post:', error);
	}
}

async function storeAccessToken(token, expiresIn, env) {
	const expiry = Date.now() + 3456000 * 1000; // Convert to milliseconds and add current timestamp
	const data = JSON.stringify({ token, expiry }); // Store token and expiry time as a single value
	const kv = await env.REVIEWS.put('access_token', data);
	console.log(' ok ! Access token stored in KV');
}

async function getAccessToken(env) {
	const current_token = await env.REVIEWS.get('access_token');

	const parsedData = JSON.parse(current_token);
	console.log(parsedData);
	const timestampnow = Date.now();

	if (parsedData.expiry <= timestampnow) {
		console.log('token expired');
		return refreshAccessToken(current_token);
	}

	return parsedData.token;
}
async function refreshAccessToken(currentToken, env) {
	console.log(env.REVIEWS);
	try {
		const response = await fetch(`https://graph.threads.net/refresh_access_token?grant_type=th_refresh_token&access_token=${currentToken}`);

		if (response.ok) {
			const data = await response.json();
			console.log('data from new api', data);
			await storeAccessToken(data.access_token, data.expires_in, env);
			return data.access_token;
		} else {
			throw new Error(`Failed to refresh token. Status: ${response.status}`);
		}
	} catch (error) {
		console.error('Error refreshing access token:', error);
		throw error;
	}
}

async function postMovieData(data, token) {
	let allSuccessful = true;

	try {
		for (const movieData of data) {
			try {
				await new Promise((resolve) => setTimeout(resolve, 20000)); // Wait for 20 seconds
				await createThreadsPost(movieData, token);
			} catch (error) {
				console.error(`Failed to post movie data: ${error.message}`);
				allSuccessful = false;
				// Optionally, break the loop here if you want to stop on first failure
				// break;
			}
		}
	} catch (error) {
		console.error(`An unexpected error occurred: ${error.message}`);
		allSuccessful = false;
	}

	return {
		success: allSuccessful,
		message: allSuccessful ? 'All movie data posted successfully' : 'Some posts failed',
	};
}

export default {
	fetch: router.fetch,
	scheduled: async (event, env, ctx) => {
		console.log('scheduled');
		const freshReviews = await getTopReviews();
		const updatedReviews = await updateDatabase(freshReviews, env);
		const data = await getMovieReviewData(updatedReviews);
		const token = await getAccessToken(env);
		const result = await postMovieData(data, token);
		return result;
	},
};

router.get('/', async (event, env, ctx) => {
	console.log(env.REVIEWS);
	const freshReviews = await getTopReviews();
	try {
		const updatedReviews = await updateDatabase(freshReviews, env);
		const data = await getMovieReviewData(updatedReviews);
		const token = await getAccessToken(env);
		const result = await postMovieData(data, token);
		return result;
	} catch (e) {
		console.log(e);
		return 'failed';
	}
});
