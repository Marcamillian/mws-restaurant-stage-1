var gulp = require('gulp');
var del = require('del');
var gm = require('gulp-gm');
var rename = require('gulp-rename');
var cleanCSS = require('gulp-clean-css');

var resizeImageTasks =[];

// resize restaurant images
[
  {width: 400, suffix: '1x', source: 'images_src/restaurants/*.{jpg,png}'},
  {width: 800, suffix: '2x', source: 'images_src/restaurants/*.{jpg,png}'},
  {width: 192, suffix: '1x', source: 'images_src/launcher-icon*'},
  {width: 512, suffix: '2x', source: 'images_src/launcher-icon*'}
].forEach((setting)=>{
    var taskName = `resize-image-${setting.width}-${setting.suffix}`;
    // create the task
    gulp.task(taskName, ()=>{
        gulp.src(setting.source)
          .pipe(gm( (gmfile) => {
              return gmfile.resize(setting.width)},
              {imageMagick: true}
          ))
          .pipe(rename({suffix: `-${setting.width}_${setting.suffix}`}))
          .pipe(gulp.dest(`img`))
    });
    // add the task to the array
    resizeImageTasks.push(taskName);
})

//copy the svgs to the images folder
gulp.task('copy-svgs', ()=>{
    gulp.src('images_src/**/*.svg')
      .pipe(gulp.dest('img'))
})
resizeImageTasks.push('copy-svgs')

gulp.task('resize-images', resizeImageTasks);

gulp.task('clear-images', ()=>{
    return del(`img/**/*`)
})

gulp.task('grab-idb', ()=>{
    gulp.src(['node_modules/idb/lib/idb.js'])
      .pipe(gulp.dest('js'))
})

gulp.task('minify-css', ()=>{
    return gulp.src('css_src/*.css')
      .pipe(cleanCSS({compatibility: 'ie8'}))
      .pipe(gulp.dest('css'))
})

gulp.task('default', ['clear-images', 'resize-images'])