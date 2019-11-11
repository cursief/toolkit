/**
 * Packages
 */

// Base packages
const gulp         = require('gulp');
const fs           = require('fs');
const del          = require('del');
const path         = require('path');
const chalk        = require('chalk');

// Gulp helper packages
const notify       = require('gulp-notify');
const cache        = require('gulp-cached');
const gulpif       = require('gulp-if');
const rename       = require('gulp-rename');
const map          = require('map-stream');

// SCSS packages
const scss         = require('gulp-sass');
const autoprefixer = require('gulp-autoprefixer');
const sourcemaps   = require('gulp-sourcemaps');

// JavaScript packages
const rollup       = require('rollup').rollup;
const resolve      = require('rollup-plugin-node-resolve');
const commonjs     = require('rollup-plugin-commonjs');
const terser       = require('rollup-plugin-terser').terser;
const builtins     = require('rollup-plugin-node-builtins');

// HTML packages
const handlebars   = require('gulp-compile-handlebars');
const htmlmin      = require('gulp-htmlmin');

// Image packages
const sharp        = require('sharp');

// Development server packages
const browserSync  = require('browser-sync').create();

// ASCII flair
console.log(chalk.hex('#3C5756').bold(`
┌─────────┐
│ S     Q │
│         │
│ R     E │
└─────────┘
`));

/**
 * Load the gulp config.
 */
const configLocation = path.resolve('./gulp-config.json');
const package        = require('./package.json');

if (!fs.existsSync(configLocation)) {
  console.error(chalk.red(`[SQRE]: No config file found in project folder (${configLocation})`));
  process.exit(5);
}

const config = require(configLocation);
config.buildOptions.project.source = path.resolve(config.buildOptions.project.source);
config.buildOptions.project.destination = path.resolve(config.buildOptions.project.destination);

let ENVIRONMENT = 'development';
let rollupCache;

/**
 * Set the environment variable.
 *
 * @param {string} env
 */
function setProductionEnvironment(done) {
  ENVIRONMENT = 'production';

  done();
}

/**
 * Create a gulpified BrowserSync reload.
 *
 * @param {function} done
 */
function reload(done) {
  browserSync.reload();
  done();
}

/**
 * Create resolved source paths from config.
 *
 * @param {string|array} location
 * @param {string} prefix
 */
function createSource(location, prefix) {
  if (typeof location === 'string') {
    return path.join(
      prefix || config.buildOptions.project.source,
      location
    );
  } else if (location instanceof Array) {
    return location.map(src => {
      let not = '';

      if (src.indexOf('!') === 0) {
        not = '!';
        src = src.substr(1);
      }

      return not + path.join(
        prefix || config.buildOptions.project.source,
        src
      );
    });
  }

  console.error(chalk.red(`[SQRE] Could not create source for: ${location}`));

  return false;
}

/**
 * Create concatenated source paths from config.
 *
 * @param {string|array} location
 * @param {string} prefix
 */
function concatSource(location, prefix) {
  if (typeof location === 'string') {
    let not = '';

    if (location.indexOf('!') === 0) {
      not = '!';
      location = location.substr(1);
    }

    return `${not}${prefix || config.buildOptions.project.source}/${location}`;

  } else if (location instanceof Array) {
    return location.map(src => {
      let not = '';

      if (src.indexOf('!') === 0) {
        not = '!';
        src = src.substr(1);
      }

      return `${not}${prefix || config.buildOptions.project.source}/${src}`;
    });
  }

  console.error(chalk.red(`[SQRE] Could not join source for: ${location}`));

  return false;
}

/**
 * Clean the destination folder.
 */
function cleanTask(done) {
  console.info(chalk.blue(`[SQRE]: Done cleaning destination folder: ${config.buildOptions.project.destination}/`));
  return del(config.buildOptions.project.destination);
}

/**
 * Compile CSS to SCSS and compress.
 */
function scssTask() {
  console.info(chalk.blue(`[SQRE]: Compiling CSS...`));

  return gulp.src(
    createSource(config.buildOptions.scss.source),
    { base: createSource(config.buildOptions.scss.base), allowEmpty: true })
  .pipe(gulpif(ENVIRONMENT === 'development', sourcemaps.init()))
  .pipe(scss({ outputStyle: 'compressed' }))
    .on('error', notify.onError('SCSS compile error: <%= error.message %>'))
  .pipe(autoprefixer({ overrideBrowserslist: config.buildOptions.scss.browserList }))
  .pipe(gulpif(ENVIRONMENT === 'development', sourcemaps.write('.')))
  .pipe(gulp.dest(createSource(config.buildOptions.scss.destination, config.buildOptions.project.destination)))
  .pipe(browserSync.stream());
}

/**
 * Compile ES6 to ES5, minify and bundle script file.
 */
function jsTask() {
  console.info(chalk.blue(`[SQRE]: Compiling JS...`));

  const bundleFile = createSource(config.buildOptions.javascript.output, config.buildOptions.project.destination);

  const terse = () => (ENVIRONMENT !== 'development') ? terser() : '';

  return rollup({
    input: createSource(config.buildOptions.javascript.input),
    inlineDynamicImports: true,
    cache: rollupCache,
    treeshake: true,
    plugins: [
      resolve({
        preferBuiltins: true
      }),
      commonjs(),
      builtins(),
      terse()
    ]
  })
  .then(bundle => {
    rollupCache = bundle.cache;

    return bundle.write({
      file: bundleFile,
      format: 'iife',
      sourcemap: (ENVIRONMENT === 'development')
    });
  })
  .catch(error => {
    notify.onError('JS compile error: <%= error.message %>')
  });
}

/**
 * Process all images.
 */
function imageAssetsTask(done) {
  console.info(chalk.blue(`[SQRE]: Processing images...`));

  // Always resize and optimize all images
  return gulp.src(concatSource(config.buildOptions.images.source), {
    base: config.buildOptions.project.source,
    allowEmpty: true
  })
  .pipe(cache('assets-images', { optimizeMemory: true }))
  .pipe(map(
    async (file, cb) => {
      const promises = [];
      const relativePath = path.dirname(file.path.replace(path.resolve(config.buildOptions.project.source), ''));
      let fileExt = path.extname(file.path);
      const fileNameNoExt = path.basename(file.path, fileExt);

      fs.mkdirSync(path.resolve(path.join(config.buildOptions.project.destination, relativePath)), { recursive: true });

      const types = {
        webp: 'webp'
      };

      fileExt = fileExt.substr(1);

      if (fileExt === 'jpeg' || fileExt === 'jpg') {
        types.jpeg = 'jpg';
      } else if (fileExt === 'png') {
        types.png = 'png';
      }

      let imageInfo;

      // Get image width
      await sharp(file.contents)
      .metadata()
      .then(info => {
        imageInfo = info;
      });

      // For each size
      Object.entries(config.buildOptions.images.resize).forEach(sizeEntry => {

        // For each type
        promises.concat(Object.entries(types).map(entry => new Promise(resolve => {
          const fileName = `${fileNameNoExt}${sizeEntry[0]}.${entry[1]}`;

          sharp(file.contents)
          .resize({ width: Math.round((1 / parseFloat(sizeEntry[1])) * imageInfo.width) })
          [entry[0]](config.buildOptions.images[entry[0]])
          .toFile(path.resolve(path.join(config.buildOptions.project.destination, relativePath, fileName)), () => {
            resolve();
          });
        })));
      });

      await Promise.all(promises);

      cb(null);
    }
  ));
}

/**
 * Inline external SVG into HTML.
 *
 * @param {*} file
 * @param {function} cb
 */
function inlineSvgHTML(file, cb) {
  return async (file, cb) => {
    const urlPattern = /<img\s?(.+)?\ssrc="inline:([^"]+\/.+svg)"([^>]+)?>/gmi;
    let fileContents = file.contents.toString('utf8');
    let urlMatch, svgPath, svgContents, svgAttributes;

    // Loop through all occurrences of the URL-pattern
    while ((urlMatch = urlPattern.exec(fileContents)) !== null) {
      svgAttributes = (urlMatch[1] || '');
      svgPath = (urlMatch[2] || '');
      svgAttributes += (urlMatch[3] || '');

      // Attempt to read the SVG file
      if (fs.existsSync(path.join(config.buildOptions.project.source, svgPath))) {
        svgContents = fs.readFileSync(
          path.join(config.buildOptions.project.source, svgPath)
        ).toString('utf8');

        svgContents = svgContents.replace(/<svg\s(.+?)>/, `<svg $1 ${svgAttributes}>`);

        // Replace the matched string with the data URI
        fileContents = fileContents.slice(0, urlMatch.index)
          + svgContents.trim()
          + fileContents.slice((urlMatch.index + urlMatch[0].length));

        urlPattern.lastIndex = (urlMatch.index + 1);
      } else {
        console.log(chalk.red(`[SQRE]: Inline SVG in HTML: File: ${path.join(config.buildOptions.project.source, svgPath)} does not exist`));
      }
    }

    file.contents = Buffer.from(fileContents);
    return cb(null, file);
  }
}

/**
 * Move all default assets.
 */
function otherAssetsTask() {
  console.info(chalk.blue(`[SQRE]: Moving other assets...`));

  return gulp.src(createSource(config.buildOptions.otherAssets.source), {
    base: config.buildOptions.project.source,
    allowEmpty: true
  })
  .pipe(cache('assets-default', { optimizeMemory: true }))
  .pipe(gulp.dest(config.buildOptions.project.destination));
}

/**
 * Move HTML files to destination while inlining SVG files.
 */
function htmlTask() {
  console.info(chalk.blue(`[SQRE]: Parsing HTML...`));

  let templateData = { },
  options = {
    ignorePartials: true, //ignores the unknown footer2 partial in the handlebars template, defaults to false
    partials: {
      footer: '<footer>the end</footer>'
    },
    batch: createSource(config.buildOptions.partials.source),
    helpers: {
      capitals: function(str){
        return str.toUpperCase();
      },
      safeVal: function (value, safeValue) {
        var out = value || safeValue;
        return new handlebars.Handlebars.SafeString(out);
      },
      concat: function (value, nextValue) {
        return new handlebars.Handlebars.SafeString(value + nextValue);
      },
      safeValConcat: function (value, delimiter, safeValue) {
        if (value) {
          return new handlebars.Handlebars.SafeString(value + delimiter + safeValue);
        }
        return safeValue;
      },
    }
  }

  return gulp.src(createSource(config.buildOptions.pages.source), {
    base: createSource(config.buildOptions.pages.base)
  })
  .pipe(handlebars(templateData, options))
  .pipe(map(inlineSvgHTML()))
  .pipe(htmlmin({ collapseWhitespace: true }))
  .pipe(gulp.dest(config.buildOptions.project.destination));
}

/**
 * Serve the website through BrowserSync with a PHP server.
 *
 * @param {function} done
 */
function serve(done) {
  const source = path.resolve(config.buildOptions.project.destination);

  if (!fs.existsSync(source)) {
    return false;
  }

  browserSync.init({
    watch: true,
    server: "./dist",
    port: config.buildOptions.server.port,
    injectChanges: true,
    open: true,
    notify: false
  });

  done();
}

/**
 * Default watch task for every relevant file for the project.
 */
function watchTask() {
  // Images
  gulp.watch(
    concatSource(config.buildOptions.images.source), {
      cwd: config.buildOptions.project.source
    },
    gulp.series(imageAssetsTask, reload));

  // Other assets
  gulp.watch(
    createSource(config.buildOptions.otherAssets.source), {
      cwd: config.buildOptions.project.source
    },
    gulp.series(otherAssetsTask, htmlTask, reload));

  // HTML
  gulp.watch(
    concatSource([
      config.buildOptions.pages.source,
      `${config.buildOptions.partials.source}/**/*`
    ]), {
      cwd: config.buildOptions.project.source
    }, gulp.series(htmlTask, reload));

  // SCSS
  gulp.watch(concatSource(config.buildOptions.scss.watch), {
    cwd: config.buildOptions.project.source
  }, scssTask);

  // JS
  gulp.watch(
    concatSource(config.buildOptions.javascript.watch), {
      cwd: config.buildOptions.project.source
    },
    gulp.series(jsTask, reload));
}

/**
 * watch task
 */
gulp.task('watch',
  gulp.series(
    cleanTask,

    gulp.parallel(
      otherAssetsTask,
      imageAssetsTask,
      htmlTask,
      scssTask,
      jsTask
    ),

    gulp.parallel(
      serve,
      watchTask
    )
  )
);

/**
 * watch:production task
 */
gulp.task('watch:production',
  gulp.series(
    setProductionEnvironment,
    cleanTask,

    gulp.parallel(
      otherAssetsTask,
      imageAssetsTask,
      htmlTask,
      scssTask,
      jsTask
    ),

    gulp.parallel(
      serve,
      watchTask
    )
  )
);

/**
 * watch:skipImages task
 */
gulp.task('watch:skipImages',
  gulp.series(
    cleanTask,

    gulp.parallel(
      otherAssetsTask,
      htmlTask,
      scssTask,
      jsTask
    ),

    gulp.parallel(
      serve,
      watchTask
    )
  )
);

/**
 * watch:production:skipImages task
 */
gulp.task('watch:production:skipImages',
  gulp.series(
    setProductionEnvironment,
    cleanTask,

    gulp.parallel(
      otherAssetsTask,
      htmlTask,
      scssTask,
      jsTask
    ),

    gulp.parallel(
      serve,
      watchTask
    )
  )
);

/**
 * build task
 */
gulp.task('build',
  gulp.series(
    cleanTask,

    gulp.parallel(
      otherAssetsTask,
      imageAssetsTask,
      htmlTask,
      scssTask,
      jsTask
    )
  )
);

/**
 * build:production task
 */
gulp.task('build:production',
  gulp.series(
    setProductionEnvironment,
    cleanTask,

    gulp.parallel(
      otherAssetsTask,
      imageAssetsTask,
      htmlTask,
      scssTask,
      jsTask
    )
  )
);

/**
 * build:skipImages task
 */
gulp.task('build:skipImages',
  gulp.series(
    cleanTask,

    gulp.parallel(
      otherAssetsTask,
      htmlTask,
      scssTask,
      jsTask
    )
  )
);

/**
 * build:production:skipImages task
 */
gulp.task('build:production:skipImages',
  gulp.series(
    setProductionEnvironment,
    cleanTask,

    gulp.parallel(
      otherAssetsTask,
      htmlTask,
      scssTask,
      jsTask
    )
  )
);
