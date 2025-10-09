module.exports = {
  plugins: [
    require('postcss-import')({
      path: ['assets/css']
    }),
    require('autoprefixer'),
    require('cssnano')({
      preset: 'default',
    }),
  ],
}