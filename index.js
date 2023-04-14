const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const AdmZip = require("adm-zip");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

const MAX_MOVIES = 10;
const BASE_URL = "https://yts-subs.com";

// create the CSV writer object for writing movie data to a CSV file
const csvWriter = createCsvWriter({
  path: "movies.csv",
  header: [
    { id: "id", title: "ID" },
    { id: "name", title: "Name" },
    { id: "link", title: "Link" },
    { id: "subtitleLink", title: "Subtitle Link" },
    { id: "subtitle", title: "Subtitle Data" },
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
 *
 * @param {Object} page - The Puppeteer page object.
 * @param {string} pageUrl - The URL of the page to scrape for movie listings.
 * @param {number} startIndex - The starting index of the movies list.
 * @return {Array} - An array of movie objects containing movie details.
 */
async function getMoviesList(page, pageUrl, startIndex) {
  // Initialize the movie index with the `startIndex` value
  let movieIndex = startIndex;

  // Waits for the page to navigate to `pageUrl`
  await page.goto(pageUrl);

  // Extract the current page number from the `pageUrl`
  const currentPageNumber = parseInt(pageUrl.match(/page=(\d+)/)[1]); // Extract the current page number
  console.log(`Current Page: ${currentPageNumber}`);

  // Initialize an empty array to store the movie details
  const movieList = await page.$$("ul.media-list > li.media");
  const movies = [];

  // Check that the `movieList` array is not empty
  if (movieList.length === 0) {
    console.log("No movies found on this page.");
    return null;
  }

  // Loop through each movie in the list
  for (let i = 0; i <= movieList.length && movieIndex <= MAX_MOVIES; i++) {
    const movie = movieList[i];

    // Check that the `movie` element is not undefined
    if (!movie) {
      console.log(`Movie ${i} is undefined.`);
      continue;
    }

    // Extract the name of the movie
    const movieName = await movie.$eval(
      "h3.media-heading",
      (el) => el.textContent
    );
    // Extract the link to the movie
    const movieLink = await movie.$eval("a[itemprop=url]", (el) => el.href);

    // Check that the `movieLink` variable is not empty
    if (!movieLink) {
      console.log(`Movie ${i} link is empty.`);
      continue;
    }

    // Open a new page and navigate to the movie link to get the English subtitle link
    const subtitleLink = await getEnglishSubtitleLink(page, movieLink);

    // If we have a valid subtitle link, add the movie details to the `movies` array and increment the `movieIndex` counter
    if (subtitleLink !== null) {
      // Start the download process for the subtitle and get the download data
      const downloadData = await startDownload(subtitleLink, page);

      console.log(`Movie ${movieIndex}:`);
      console.log(`Name: ${movieName}`);
      console.log(`Link: ${movieLink}`);
      console.log(`Subtitle Link: ${subtitleLink}\n`);
      //push the data to the movies array
      movies.push({
        id: movieIndex,
        name: movieName,
        link: movieLink,
        subtitleLink,
        subtitle: downloadData .replace(/[\n\r]+/g, " ") // Replace newlines and carriage returns with spaces
        .replace(
          /\d+\s\d+:\d+:\d+,\d+\s-->\s\d+:\d+:\d+,\d+\s|\s?<i>|<\/i>\s?/g,
          ""
        ), // remove each timestamp and <i> element,
      });
      //increment the moves index by 1
      movieIndex++;
    }
  }
  // Return the list of movies
  return movies;
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
