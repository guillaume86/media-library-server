(function() {
  var MediaLibary, basePath, dirname, fs, getCover, handlers, joinPath, library, mapAlbum, mapArtist, mapTrack, send, _, _ref;

  fs = require('fs');

  _ref = require('path'), dirname = _ref.dirname, joinPath = _ref.join;

  send = require('send');

  _ = require('lodash');

  MediaLibary = require('media-library');

  library = null;

  basePath = null;

  getCover = function(covers, size) {
    covers = _.sortBy(covers, function(c) {
      return c.size;
    });
    if (size === 'small') {
      return covers[0].name;
    }
    if (size === 'medium') {
      return covers[Math.ceil(covers.length / 2) - 1].name;
    }
    if (size === 'large') {
      return covers[covers.length - 1].name;
    }
    return covers[0].name;
  };

  mapTrack = function(track, req) {
    var getCoverUrl, images, _ref1;
    getCoverUrl = function(size) {
      return [req.protocol + '://' + req.get('host'), basePath, 'tracks', track._id, 'cover', size].join('/');
    };
    images = null;
    if (track.covers) {
      images = {
        small: getCoverUrl('small'),
        medium: getCoverUrl('medium'),
        large: getCoverUrl('large')
      };
    }
    return {
      title: track.title,
      artist: (_ref1 = track.artist) != null ? _ref1[0] : void 0,
      album: track.album,
      duration: track.duration,
      year: track.year,
      url: [req.protocol + '://' + req.get('host'), basePath, 'play', track._id].join('/'),
      images: images,
      $trackid: track._id
    };
  };

  mapArtist = function(artist, req) {
    return artist;
  };

  mapAlbum = function(album, req) {
    var getCoverUrl;
    getCoverUrl = function(size) {
      return [req.protocol + '://' + req.get('host'), basePath, 'albums', album.tracks[0], 'cover', size].join('/');
    };
    return {
      title: album.title,
      artist: album.artist,
      trackids: album.tracks,
      year: album.year,
      images: {
        small: getCoverUrl('small'),
        medium: getCoverUrl('medium'),
        large: getCoverUrl('large')
      }
    };
  };

  handlers = {
    status: function(req, res, next) {
      return res.send('online');
    },
    scan: function(req, res, next) {
      res.writeHead(200, {
        'Content-Type': 'text/plain'
      });
      return library.scan().on('track', function(track) {
        console.log('scan progress: %s', track.path);
        return res.write(track.path + '\n');
      }).on('done', function(tracks) {
        res.write('scanned tracks: ' + tracks.length);
        return res.end();
      }).on('error', function(err) {
        console.error('scan error', err);
        return next(err);
      });
    },
    scanCovers: function(req, res, next) {
      res.writeHead(200, {
        'Content-Type': 'text/plain'
      });
      return library.scanCovers(function(err) {
        if (err != null) {
          console.error('scan covers error', err);
          return next(err);
        }
        res.write('scan done');
        return res.end();
      });
    },
    tracks: function(req, res, next) {
      return library.tracks(req.query, function(err, tracks) {
        var track;
        if (err) {
          return next(err);
        }
        return res.send((function() {
          var _i, _len, _ref1, _results;
          _ref1 = tracks || [];
          _results = [];
          for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
            track = _ref1[_i];
            _results.push(mapTrack(track, req));
          }
          return _results;
        })());
      });
    },
    albums: function(req, res, next) {
      return library.albums(req.query, function(err, albums) {
        var album;
        if (err) {
          return next(err);
        }
        return res.send((function() {
          var _i, _len, _ref1, _results;
          _ref1 = albums || [];
          _results = [];
          for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
            album = _ref1[_i];
            _results.push(mapAlbum(album, req));
          }
          return _results;
        })());
      });
    },
    artists: function(req, res, next) {
      return library.artists(req.query, function(err, artists) {
        var artist;
        if (err) {
          return next(err);
        }
        return res.send((function() {
          var _i, _len, _ref1, _results;
          _ref1 = artists || [];
          _results = [];
          for (_i = 0, _len = _ref1.length; _i < _len; _i++) {
            artist = _ref1[_i];
            _results.push(mapArtist(artist, req));
          }
          return _results;
        })());
      });
    },
    find: function(req, res, next) {
      return library.findTracks({
        artist: req.query.artist,
        title: req.query.title
      }, function(err, tracks) {
        var track;
        if (err) {
          return next(err);
        }
        return res.send((function() {
          var _i, _len, _results;
          _results = [];
          for (_i = 0, _len = tracks.length; _i < _len; _i++) {
            track = tracks[_i];
            _results.push(mapTrack(track, req));
          }
          return _results;
        })());
      });
    },
    play: function(req, res, next) {
      return library.tracks({
        _id: req.params.id
      }, function(err, results) {
        if (err) {
          return next(err);
        }
        if (!results.length) {
          res.statusCode = 404;
          res.end();
          return;
        }
        return send(req, results[0].path).on('error', next).pipe(res);
      });
    },
    trackcover: function(req, res, next) {
      var size;
      size = req.params.size;
      return library.tracks({
        _id: req.params.id
      }, function(err, results) {
        var cover, track;
        if (err) {
          return next(err);
        }
        if (!results.length) {
          res.statusCode = 404;
          res.end();
          return;
        }
        track = results[0];
        cover = null;
        if (track.covers) {
          cover = getCover(track.covers, size);
        }
        if (!cover) {
          res.statusCode = 404;
          res.end();
          return;
        }
        cover = joinPath(dirname(track.path), cover);
        return send(req, cover, {
          maxAge: 1000 * 60 * 60 * 24 * 30
        }).on('error', next).pipe(res);
      });
    },
    albumcover: function(req, res, next) {
      return handlers.trackcover(req, res, next);
    }
  };

  module.exports = {
    standalone: function(config) {
      var app, bodyParser, cors, env, errorhandler, express, logger;
      express = require("express");
      logger = require('morgan');
      bodyParser = require('body-parser');
      errorhandler = require('errorhandler');
      cors = require('cors');
      env = process.env.NODE_ENV || 'development';
      app = express();
      if (!config.disableLogs) {
        app.use(logger(':remote-addr :method :url'));
      }
      app.use(bodyParser.urlencoded({
        extended: true
      }));
      app.use(bodyParser.json());
      app.use(cors());
      if ('development' === env) {
        app.use(errorhandler({
          dumpExceptions: true,
          showStack: true
        }));
      } else {
        app.use(errorhandler());
      }
      this.setup(app, config);
      return app;
    },
    setup: function(app, config, path) {
      basePath = path || '';
      library = new MediaLibary(config);
      app.get('/status', handlers.status);
      app.get('/scan', handlers.scan);
      app.get('/scan-covers', handlers.scanCovers);
      app.get('/tracks', handlers.tracks);
      app.get('/albums', handlers.albums);
      app.get('/artists', handlers.artists);
      app.get('/find', handlers.find);
      app.get('/tracks/:id/cover/:size', handlers.trackcover);
      app.get('/albums/:id/cover/:size', handlers.albumcover);
      return app.get('/play/:id', handlers.play);
    }
  };

}).call(this);
