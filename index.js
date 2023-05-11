const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const AdmZip = require("adm-zip");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

const MAX_MOVIES = 2;
const BASE_URL = "https://yts-subs.com";

// create the CSV writer object for writing movie data to a CSV file
const csvWriter = createCsvWriter({
  path: "movies.csv",
  header: [
    { id: "name", title: "Name" },
    { id: "subtitle", title: "Subtitle Data" },
    { id: "part", title: "Subtitle Part" },
  ],
});
/**
 * Writes an array of movie objects to a CSV file.
 * @param {Array} movies - An array of movie objects containing properties for name, link, subtitleLink, and subtitle data.
 * @return {void} - This function does not return anything directly, but logs a message to the console.
 */
async function writeMoviesToCsv(movies) {
  await csvWriter.writeRecords(movies);
  console.log("Movies have been written to CSV file");
}

/**
 * Gets the download link for English subtitles from a given web page.
 *
 * @param {Page} newPage - The new page object representing the web page.
 * @param {string} movieLink - The URL of the movie to get the subtitle link for.
 * @return {Promise<string|null>} - A Promise that resolves to the download link for English subtitles, or null if not found.
 */
async function getEnglishSubtitleLink(page, movieLink) {
  // create a new page object
  const newPage = await page.browser().newPage();

  // navigate to the subtitle download page using the new page object
  await newPage.goto(movieLink);

  // find the subtitles table on the newPage and get all the rows in the table
  const subtitlesTable = await newPage.$(".table.other-subs tbody");
  const subtitlesRows = await subtitlesTable.$$("tr");
  // iterate through the rows and look for the one with English subtitles
  for (const row of subtitlesRows) {
    const language = await row.$eval(".sub-lang", (el) =>
      el.textContent.trim()
    );
    // if English subtitles are found, get the download link from the row and return it
    if (language === "English") {
      return row.$eval(".subtitle-download", (el) => el.href);
    }
  }
  // if English subtitles are not found, return null
  return null;
}

/**
 * Starts the download process for subtitles from a given URL.
 *
 * @param {string} url - The URL of the subtitle download page.
 * @param {Page} page - The page object representing the web page.
 * @return {Promise<any>} - A Promise that resolves to the extracted subtitle data.
 */

async function startDownload(url, page) {
  try {
    console.log("URL : ", url.trim());
    //check the url is valid
    if (!url) {
      console.error("URL is not valid");
    }

    // extract the filename from the URL and convert it to a more readable format
    const fileName = url.split("/").pop();

    // create the directory where the subtitles will be downloaded if it doesn't exist
    const currentDir = process.cwd();
    const subtitlesDir = path.join(currentDir, "subtitles");
    if (!fs.existsSync(subtitlesDir)) {
      fs.mkdirSync(subtitlesDir);
      console.log('The "subtitles" folder has been created');
    }

    // create a subdirectory for the movie if it doesn't exist
    const createMovieFolderName = path.join(subtitlesDir, fileName);
    if (!fs.existsSync(createMovieFolderName)) {
      fs.mkdirSync(createMovieFolderName);
    }
    // Set the file path where the subtitles will be downloaded
    const filePath = path.join(createMovieFolderName, `${fileName}.zip`);
    // If the file doesn't exist, download it
    if (!fs.existsSync(filePath)) {
      console.log("The file does not exist in the subtitles folder");
      await downloadSubtitles(page, url, createMovieFolderName);
    } else {
      // If the file already exists, extract the subtitles from it
      let data = await extractSubtitles(filePath, createMovieFolderName);
      return data;
    }

    // Wait until extractSubtitles finishes extracting the file
    let data = await extractSubtitles(filePath, createMovieFolderName);
    return data;
  } catch (error) {
    console.error(`Error occurred during download: ${error}`);
    return null;
  }
}

/**
 * Downloads subtitles from a given URL to a specified directory.
 *
 * @param {Page} page - The page object representing the web page.
 * @param {string} url - The URL of the subtitle download page.
 * @param {string} subtitlesDir - The directory where subtitles will be downloaded.
 * @return {Promise<any>} - A Promise that resolves to the extracted subtitle data.
 */

async function downloadSubtitles(page, url, subtitlesDir) {
  try {
    // create a new page object
    const newPage = await page.browser().newPage();
    // create a client session and set download behavior to allow downloads and specify the download directory
    const client = await newPage.target().createCDPSession();
    await client.send("Page.setDownloadBehavior", {
      behavior: "allow",
      downloadPath: subtitlesDir,
    });
    // navigate to the subtitle download page using the new page object
    await newPage.goto(url);
    console.log(`Navigated to ${url}`);

    // click on the download button and wait for 10 seconds to complete the download
    await newPage.click(".download-subtitle");
    console.log("Clicked on the download button");
    await newPage.waitForTimeout(10000);
    console.log(`The file has been downloaded to ${subtitlesDir}`);
    // close the new page object
    await newPage.close();
    console.log("New page closed");

    // extract the downloaded file's name and path and return the extracted subtitle data
    const fileName = url.substring(url.lastIndexOf("/") + 1);
    const filePath = path.join(subtitlesDir, `${fileName}.zip`);
    let data = await extractSubtitles(filePath, subtitlesDir);
    return data;
  } catch (error) {
    console.error(`Error occurred during subtitle download: ${error}`);
    return null;
  }
}

/**
 * Extracts subtitles from a given zip file to a specified directory and returns the extracted data as JSON.
 *
 * @param {string} filePath - The path to the zip file.
 * @param {string} subtitlesDir - The directory where the subtitles will be extracted.
 * @return {Promise<string>} - A Promise that resolves to the extracted subtitles data in JSON format.
 */

async function extractSubtitles(filePath, subtitlesDir) {
  return new Promise((resolve, reject) => {
    // create a new instance of the AdmZip module with the filePath
    const zip = new AdmZip(filePath);
    console.log(`Extracting ${filePath}...`);

    // extract the contents of the zip file to the subtitlesDir directory
    // and run the callback function with any errors that occur during extraction
    zip.extractAllToAsync(subtitlesDir, true, (error) => {
      if (error) {
        // if there is an error during extraction, reject the promise with the error
        reject(error);
      } else {
        console.log(`The file ${filePath} has been extracted`);
        // get an array of all entries in the zip file
        const entries = zip.getEntries();

        // loop through the entries and find the one that ends with ".srt"
        let subtitleEntry = null;
        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          if (entry.entryName.endsWith(".srt")) {
            subtitleEntry = entry;
            break;
          }
        }
        if (subtitleEntry) {
          // if a subtitle file is found, extract its data as a string
          const subtitleData = subtitleEntry.getData().toString("utf-8");
          resolve(subtitleData);
        } else {
          // if no subtitle file is found, reject the promise with an error message
          reject(new Error("No subtitle file found in zip"));
        }
      }
    });
  });
}

/**
 * Retrieves a list of movies from a given page URL, starting from a specified index.
 * Break the subtitles into parts for their respective movies.
 *
 * @param {Object} page - The Puppeteer page object.
 * @param {string} pageUrl - The URL of the page to scrape for movie listings.
 * @param {number} startIndex - The starting index of the movies list.
 * @return {Array} - An array of movie objects containing movie details.
 */
async function getMoviesList(page, pageUrl, startIndex) {
  let movieIndex = startIndex; // Set the starting index for the movies
  await page.goto(pageUrl); // Navigate to the given URL using the Puppeteer page object

  const movieList = await page.$$("ul.media-list > li.media"); // Select all the movies on the page using a CSS selector
  const movies = []; // Initialize an empty array to store the movie data

  // If no movies were found on the page
  if (movieList.length === 0) {
    console.log("No movies found on this page."); // Print a message to the console
    return null; // Return null
  }
  // Loop through each movie on the page
  for (let i = 0; i < movieList.length && movieIndex <= MAX_MOVIES; i++) {
    const movie = movieList[i]; // Get the current movie element

    console.log(`Processing movie ${movieIndex} of ${MAX_MOVIES}`);

    // If the movie element is undefined
    if (!movie) {
      console.log(`Movie ${i} is undefined.`); // Print a message to the console
      continue; // Skip to the next movie
    }

    // Get the name of the movie by evaluating the given selector in the context of the current movie element
    const movieName = await movie.$eval(
      "h3.media-heading",
      (el) => el.textContent
    );
    // If the movie link is empty
    if (!movieName) {
      console.log(`Movie ${i} link is empty.`); // Print a message to the console
      continue; // Skip to the next movie
    }

    // Get the link to the movie by evaluating the given selector in the context of the current movie element
    const movieLink = await movie.$eval("a[itemprop=url]", (el) => el.href);

    // If the movie link is empty
    if (!movieLink) {
      console.log(`Movie ${i} link is empty.`); // Print a message to the console
      continue; // Skip to the next movie
    }

    // Get the link to the English subtitle for the current movie using the provided function
    const subtitleLink = await getEnglishSubtitleLink(page, movieLink);

    // If the subtitle link is empty
    if (!subtitleLink) {
      console.log(`Subtitle ${i} link is empty.`); // Print a message to the console
      continue; // Skip to the next movie
    }
    // Download the subtitle data using the provided function
    const downloadData = await startDownload(subtitleLink, page);

    // If the subtitle download data is empty
    if (!downloadData) {
      console.log(`Download ${i} data is empty.`); // Print a message to the console
      continue; // Skip to the next movie
    }

    console.log(`Movie ${movieIndex}:`);
    console.log(`Name: ${movieName}`);
    console.log(`Link: ${movieLink}`);
    console.log(`Subtitle Link: ${subtitleLink}\n`);

    // This code takes a string of subtitle data and processes it into an array of chunks,
    // each containing up to 102 characters of text, with no timestamps or <i> tags.
    const subtitleChunks = downloadData
      .replace(/[\n\r]+/g, " ") // Replace newlines and carriage returns with spaces
      .replace(
        /\d+\s\d+:\d+:\d+,\d+\s-->\s\d+:\d+:\d+,\d+\s|\s?<i>|<\/i>\s?/g,
        ""
      ) // remove each timestamp and <i> element,;
      .match(/.{1,102}/g); // Split the resulting text into an array of chunks, each with up to 102 characters

    // create a new array by map
    // Create an array of objects representing each chunk of the subtitle
    const movieSubtitles = subtitleChunks.map((chunk, index) => ({
      name: movieName,
      subtitle: chunk.trim(),
      part: `part ${index + 1}`,
    }));
    // push the collected data to movies array
    movies.push(...movieSubtitles);
    //increment the movie index by 1
    movieIndex++;
  }

  return movies; // return the movies array
}

/**
 * Scrapes movies from a website and saves the data to a CSV file.
 */
async function scrapeMovies() {
  console.log("Starting the script");
  // Launch a headless browser instance using Puppeteer
  const browser = await puppeteer.launch({ headless: true });

  // Create a new page object
  const page = await browser.newPage();

  // Initialize an empty array to store the movie details
  const movies = [];

  // Initialize the `startIndex` and `movieCount` variables
  let startIndex = 1;
  let movieCount = 0;

  // Loop through the pages of movies until we have reached the `MAX_MOVIES` limit
  for (let i = 1; movieCount <= MAX_MOVIES; i++) {
    // Construct the URL for the current page of movies
    const pageUrl = `${BASE_URL}/browse?page=${i}`;
    const currentPageNumber = parseInt(pageUrl.match(/page=(\d+)/)[1]); // Extract the current page number from the URL using a regular expression
    console.log(`Current Page: ${currentPageNumber}`); // Print the current page number to the console

    // Call the `getMoviesList` function to get the list of movies on the current page
    const moviesList = await getMoviesList(page, pageUrl, startIndex);

    // If we didn't find any movies on the current page, break out of the loop
    if (moviesList.length === 0) {
      break;
    }

    // Add the movies to the `movies` array, update the `startIndex` and `movieCount` variables
    movies.push(...moviesList);
    startIndex += moviesList.length;
    movieCount += moviesList.length;
  }
  // Close the browser instance
  await browser.close();

  // Write the movie details to a CSV file
  try {
    // await fs.writeFileSync("movies.json", JSON.stringify(movies));
    await writeMoviesToCsv(movies);
    console.log("Successfully inserted the data.");
  } catch (err) {
    console.log("Error writing to file:", err);
  }
}

scrapeMovies();
