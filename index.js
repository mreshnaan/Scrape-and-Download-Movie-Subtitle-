const puppeteer = require("puppeteer");
const path = require("path");
const fs = require("fs");
const AdmZip = require("adm-zip");
const createCsvWriter = require("csv-writer").createObjectCsvWriter;

const MAX_MOVIES = 1;
const BASE_URL = "https://yts-subs.com";

const csvWriter = createCsvWriter({
  path: "movies.csv",
  header: [
    { id: "name", title: "Name" },
    { id: "link", title: "Link" },
    { id: "subtitleLink", title: "Subtitle Link" },
    { id: "subtitle", title: "Subtitle Data" },
  ],
});
/**
 * This function Create the Csv Movie File
 * @param {Array} movies - An array of movie objects containing properties for name, link, subtitleLink, and subtitle data.
 * @return {void} - This function does not return anything directly, but it logs a message
 */
async function writeMoviesToCsv(movies) {
  await csvWriter.writeRecords(movies);
  console.log("Movies have been written to CSV file");
}

/**
 * Gets the download link for English subtitles from a given web page.
 *
 * @param {Page} page - The page object representing the web page.
 * @return {Promise<string|null>} - A Promise that resolves to the download link for English subtitles, or null if not found.
 */

async function getEnglishSubtitleLink(page) {
  const subtitlesTable = await page.$(".table.other-subs tbody");
  const subtitlesRows = await subtitlesTable.$$("tr");

  for (const row of subtitlesRows) {
    const language = await row.$eval(".sub-lang", (el) =>
      el.textContent.trim()
    );

    if (language === "English") {
      return row.$eval(".subtitle-download", (el) => el.href);
    }
  }

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
  console.log("Starting the script");

  const fileName = url.substring(url.lastIndexOf("/") + 1);
  const convertFileName = fileName.replace(/-yify-\d+/g, "").replace(/-/g, " ");

  const currentDir = process.cwd();
  const subtitlesDir = path.join(currentDir, "subtitles");
  if (!fs.existsSync(subtitlesDir)) {
    fs.mkdirSync(subtitlesDir);
    console.log('The "subtitles" folder has been created');
  }
  const createMovieFolderName = path.join(subtitlesDir, fileName);

  if (!fs.existsSync(createMovieFolderName)) {
    fs.mkdirSync(createMovieFolderName);
  }
  const filePath = path.join(createMovieFolderName, `${fileName}.zip`);
  console.log(filePath);
  if (!fs.existsSync(filePath)) {
    console.log("The file does not exist in the subtitles folder");
    await downloadSubtitles(page, url, createMovieFolderName);
  } else {
    console.log(
      `The file ${convertFileName} already exists in the subtitles folder`
    );
    let data = await extractSubtitles(filePath, createMovieFolderName);
    return data;
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
  const newPage = await page.browser().newPage(); // create a new page object
  const client = await newPage.target().createCDPSession();
  await client.send("Page.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: subtitlesDir,
  });
  await newPage.goto(url); // navigate to the subtitle download page using the new page object
  console.log(`Navigated to ${url}`);
  await newPage.click(".download-subtitle");
  console.log("Clicked on the download button");
  await newPage.waitForTimeout(10000);
  console.log(`The file has been downloaded to ${subtitlesDir}`);
  await newPage.close(); // close the new page object
  console.log("New page closed");

  const fileName = url.substring(url.lastIndexOf("/") + 1);
  const filePath = path.join(subtitlesDir, `${fileName}.zip`);
  let data = await extractSubtitles(filePath, subtitlesDir);
  return data;
}

/**
 * Extracts subtitles from a given zip file to a specified directory and returns the extracted data as JSON.
 *
 * @param {string} filePath - The path to the zip file.
 * @param {string} subtitlesDir - The directory where the subtitles will be extracted.
 * @return {string} - The extracted subtitles data in JSON format.
 */

async function extractSubtitles(filePath, subtitlesDir) {
  const zip = new AdmZip(filePath);
  console.log(`Extracting ${filePath}...`);
  zip.extractAllTo(subtitlesDir, true);
  console.log(`The file ${filePath} has been extracted`);
  const entries = zip.getEntries();
  let subtitleEntry = null;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i].entryName;
    if (entry.endsWith(".srt")) {
      subtitleEntry = entry;
      break;
    }
  }
  const subtitleFileName = path.basename(subtitleEntry);
  const txtFilePath = path.join(subtitlesDir, subtitleFileName);
  console.log(
    `Reading ${subtitleEntry
      .replace(/\.srt/g, "")
      .replace(/\./g, " ")
      .toLowerCase()}...`
  );
  const data = fs.readFileSync(txtFilePath, "utf8");
  const jsonData = JSON.stringify(data);
  return jsonData;
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
  await page.goto(pageUrl);

  const currentPageNumber = parseInt(pageUrl.match(/page=(\d+)/)[1]); // Extract the current page number
  console.log(`Current Page: ${currentPageNumber}`);

  const movieList = await page.$$("ul.media-list > li.media");
  const movies = [];
  let movieIndex = startIndex;

  for (const movie of movieList) {
    if (movieIndex > MAX_MOVIES) {
      break;
    }
    const movieName = await movie.$eval(
      "h3.media-heading",
      (el) => el.textContent
    );
    const movieLink = await movie.$eval("a[itemprop=url]", (el) => el.href);
    const subtitleLink = await getEnglishSubtitleLink(
      await page
        .browser()
        .newPage()
        .then(async (p) => {
          await p.goto(movieLink);
          return p;
        })
    );

    const downloadData = await startDownload(subtitleLink, page);
    let convert = JSON.parse(downloadData)
      .replace(/\\r\\n/g, " ")
      .replace(/\\+/g, "");
    console.log(convert);

    if (subtitleLink !== null) {
      console.log(`Movie ${movieIndex}:`);
      console.log(`Name: ${movieName}`);
      console.log(`Link: ${movieLink}`);
      console.log(`Subtitle Link: ${subtitleLink}\n`);

      movies.push({
        name: movieName,
        link: movieLink,
        subtitleLink,
        subtitle: convert,
      });
      movieIndex++;
    }
  }

  return movies;
}

/**
 * Scrapes movies from a website and saves the data to a CSV file.
 */
async function scrapeMovies() {
  const browser = await puppeteer.launch({ headless: false });
  const page = await browser.newPage();

  const movies = [];
  let startIndex = 1;
  let movieCount = 0;

  for (let i = 1; movieCount <= MAX_MOVIES; i++) {
    const pageUrl = `${BASE_URL}/browse?page=${i}`;
    const moviesList = await getMoviesList(page, pageUrl, startIndex);

    if (moviesList.length === 0) {
      break;
    }

    movies.push(...moviesList);
    startIndex += moviesList.length;
    movieCount += moviesList.length;
  }

  await browser.close();

  try {
    // await fs.writeFileSync("movies.json", JSON.stringify(movies));
    await writeMoviesToCsv(movies);
    console.log("Successfully inserted the data.");
  } catch (err) {
    console.log("Error writing to file:", err);
  }
}

scrapeMovies();
