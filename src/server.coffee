fs = require 'fs'
{dirname, join: joinPath} = require 'path'
send = require 'send'
_ = require 'lodash'
MediaLibary = require 'media-library'

library = null
basePath = null

imagefileRegex = /\.(?:jpg|jpeg|gif|bmp|png)$/i

getCoverPath = (dirpath) ->
  files = _.sortBy(
    fs.readdirSync(dirpath)
    .filter((name) -> imagefileRegex.test(name))
    .map((name) ->
      path = joinPath(dirpath, name)
      return (
        name: name
        path: path
        stats: fs.statSync(path)
      )
    )
  , 'size')
  .reverse()
  # todo: order by cover etc
  # console.log(files)
  files[0]?.path

getCoverPath = _.memoize(getCoverPath)

coverurls = {}

mapTrack = (track, req) ->
  getCoverUrl = -> [
    req.protocol + '://' + req.get('host'),
    basePath, 'tracks', track._id,
    'cover'
  ].join('/')
  
  coverurl = null
  if track.coverpath
    coverurl = coverurls[track.coverpath]
    if !coverurl
      coverurl = coverurls[track.coverpath] = getCoverUrl()
  else
    coverurl = getCoverUrl()
  
  return (
    title: track.title
    artist: track.artist?[0]
    album: track.album
    duration: track.duration
    year: track.year
    url: [
      req.protocol + '://' + req.get('host'),
      basePath, 'play', track._id
    ].join('/')
    images:
      small: coverurl
      medium: coverurl
      large: coverurl
    $trackid: track._id
  )

mapArtist = (artist, req) ->
  artist

mapAlbum = (album, req) ->
  cover = [
    req.protocol + '://' + req.get('host'),
    basePath, 'albums', album.tracks[0],
    'cover'
  ].join('/')
  
  return (
    title: album.title
    artist: album.artist
    trackids: album.tracks
    year: album.year
    images:
      small: cover
      medium: cover
      large: cover
  )
  

handlers =
  status: (req, res, next) ->
    res.send('online')

  scan: (req, res, next) ->
    res.writeHead(200, {'Content-Type': 'text/plain'})
    library.scan()
    .on('track', (track) ->
      console.log('scan progress: %s', track.path)
      res.write(track.path + '\n')
    )
    .on('done', (tracks) ->
      res.write('scanned tracks: ' + tracks.length)
      res.end()
    )
    .on('error', (err) ->
      console.error('scan error', err)
      next(err)
    )

  tracks: (req, res, next) ->
    library.tracks(req.query, (err, tracks) ->
      return next(err) if err
      res.send(mapTrack(track, req) for track in (tracks || []))
    )

  albums: (req, res, next) ->
    library.albums(req.query, (err, albums) ->
      return next(err) if err
      res.send(mapAlbum(album, req) for album in (albums || []))
    )

  artists: (req, res, next) ->
    library.artists(req.query, (err, artists) ->
      return next(err) if err
      res.send(mapArtist(artist, req) for artist in (artists || []))
    )

  find: (req, res, next) ->
    library.findTracks({ artist: req.query.artist, title: req.query.title }, (err, tracks) ->
      return next(err) if err
      res.send(mapTrack(track, req) for track in tracks)
    )

  play: (req, res, next) ->
    library.findTracks({ _id: req.params.id }, (err, results) ->
      return next(err) if err
      
      if !results.length
        res.statusCode = 404
        res.end()
        return
        
      send(req, results[0].path)
      .on('error', next)
      .pipe(res)
    )
      
  trackcover: (req, res, next) ->
    library.findTracks({ _id: req.params.id }, (err, results) ->
      return next(err) if err
      if !results.length
        res.statusCode = 404
        res.end()
        return
      track = results[0]
      # todo: use album cover by default (return same url for same image)
      cover = null
      if track.coverpath
        cover = track.coverpath
      if !cover
        dirpath = dirname(track.path)
        cover = getCoverPath(dirpath)
        # save cover path in database
        if cover
          library.db
          .update(
            { _id: track._id },
            { $set: { coverpath: cover } },
            { },
            (err, num) ->
              throw err if err
              console.log('track cover updated')
          )
      
      if !cover
        res.statusCode = 404
        res.end()
        return
      
      send(req, cover, maxAge: 1000*60*60*24*30)
      .on('error', next)
      .pipe(res)
    )
      
  albumcover: (req, res, next) ->
    handlers.trackcover(req, res, next)

module.exports =
  standalone: (config) ->
    express = require "express"
    logger = require 'morgan'
    bodyParser = require 'body-parser'
    errorhandler = require 'errorhandler'
    cors = require 'cors'
    
    env = process.env.NODE_ENV || 'development'
    
    app = express()
    app.use(logger(':remote-addr :method :url')) unless config.disableLogs
    app.use(bodyParser.urlencoded(
      extended: true
    ))
    app.use(bodyParser.json())
    app.use(cors())

    if 'development' == env
      app.use(errorhandler(
        dumpExceptions: true
        showStack: true
      ))
    else
      app.use(errorhandler())
    
    @setup(app, config)
    
    return app
  
  setup: (app, config, path) ->
    console.log('setting up app', app)
    basePath = path || ''
    library = new MediaLibary(config)
    app.get('/status', handlers.status)
    app.get('/scan', handlers.scan)
    app.get('/tracks', handlers.tracks)
    app.get('/tracks/:id/cover', handlers.trackcover)
    app.get('/albums', handlers.albums)
    app.get('/albums/:id/cover', handlers.albumcover)
    app.get('/artists', handlers.artists)
    app.get('/find', handlers.find)
    app.get('/play/:id', handlers.play)
