fs = require 'fs'
{dirname, join: joinPath} = require 'path'
send = require 'send'
_ = require 'lodash'
MediaLibary = require 'media-library'

library = null
basePath = null

getCover = (covers, size) ->
  covers = _.sortBy(covers, (c) -> c.size)
  if size == 'small'
    return covers[0].name
  if size == 'medium'
    return covers[Math.ceil(covers.length/2) - 1].name
  if size == 'large'
    return covers[covers.length - 1].name
  return covers[0].name

mapTrack = (track, req) ->
  getCoverUrl = (size) -> [
    req.protocol + '://' + req.get('host'),
    basePath, 'tracks', track._id,
    'cover'
    size
  ].join('/')
  
  images = null
  if track.covers
    images =
      small: getCoverUrl('small')
      medium: getCoverUrl('medium')
      large: getCoverUrl('large')
  
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
    images: images
    $trackid: track._id
  )

mapArtist = (artist, req) ->
  artist

mapAlbum = (album, req) ->
  getCoverUrl = (size) -> [
    req.protocol + '://' + req.get('host'),
    basePath, 'albums', album.tracks[0],
    'cover'
    size
  ].join('/')
  
  return (
    title: album.title
    artist: album.artist
    trackids: album.tracks
    year: album.year
    images:
      small: getCoverUrl('small')
      medium: getCoverUrl('medium')
      large: getCoverUrl('large')
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

  scanCovers: (req, res, next) ->
    res.writeHead(200, {'Content-Type': 'text/plain'})
    library.scanCovers((err) ->
      if err?
        console.error('scan covers error', err)
        return next(err)
      res.write('scan done')
      res.end()
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
    library.tracks({ _id: req.params.id }, (err, results) ->
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
    size = req.params.size
    library.tracks({ _id: req.params.id }, (err, results) ->
      return next(err) if err
      if !results.length
        res.statusCode = 404
        res.end()
        return
      track = results[0]
      # todo: use album cover by default (return same url for same image)
      cover = null
      if track.covers
        cover = getCover(track.covers, size)
        
      if !cover
        res.statusCode = 404
        res.end()
        return
        
      # full path
      cover = joinPath(dirname(track.path), cover)
      
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
    basePath = path || ''
    library = new MediaLibary(config)
    app.get('/status', handlers.status)
    app.get('/scan', handlers.scan)
    app.get('/scan-covers', handlers.scanCovers)
    app.get('/tracks', handlers.tracks)
    app.get('/albums', handlers.albums)
    app.get('/artists', handlers.artists)
    app.get('/find', handlers.find)
    app.get('/tracks/:id/cover/:size', handlers.trackcover)
    app.get('/albums/:id/cover/:size', handlers.albumcover)
    app.get('/play/:id', handlers.play)
