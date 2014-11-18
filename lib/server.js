(function() {
  var MediaLibary, basePath, coverurls, dirname, fs, getCoverPath, handlers, imagefileRegex, joinPath, library, mapAlbum, mapArtist, mapTrack, send, _, _ref;

  fs = require('fs');

  _ref = require('path'), dirname = _ref.dirname, joinPath = _ref.join;

  send = require('send');

  _ = require('lodash');

  MediaLibary = require('media-library');

  library = null;

  basePath = null;

  imagefileRegex = /\.(?:jpg|jpeg|gif|bmp|png)$/i;

  getCoverPath = function(dirpath) {
    var files, _ref1;
    files = _.sortBy(fs.readdirSync(dirpath).filter(function(name) {
      return imagefileRegex.test(name);
    }).map(function(name) {
      var path;
      path = joinPath(dirpath, name);
      return {
        name: name,
        path: path,
        stats: fs.statSync(path)
      };
    }), 'size').reverse();
    return (_ref1 = files[0]) != null ? _ref1.path : void 0;
  };

  getCoverPath = _.memoize(getCoverPath);

  coverurls = {};

  mapTrack = function(track, req) {
    var coverurl, getCoverUrl, _ref1;
    getCoverUrl = function() {
      return [req.protocol + '://' + req.get('host'), basePath, 'tracks', track._id, 'cover'].join('/');
    };
    coverurl = null;
    if (track.coverpath) {
      coverurl = coverurls[track.coverpath];
      if (!coverurl) {
        coverurl = coverurls[track.coverpath] = getCoverUrl();
      }
    } else {
      coverurl = getCoverUrl();
    }
    return {
      title: track.title,
      artist: (_ref1 = track.artist) != null ? _ref1[0] : void 0,
      album: track.album,
      duration: track.duration,
      year: track.year,
      url: [req.protocol + '://' + req.get('host'), basePath, 'play', track._id].join('/'),
      images: {
        small: coverurl,
        medium: coverurl,
        large: coverurl
      },
      $trackid: track._id
    };
  };

  mapArtist = function(artist, req) {
    return artist;
  };

  mapAlbum = function(album, req) {
    var cover;
    cover = [req.protocol + '://' + req.get('host'), basePath, 'albums', album.tracks[0], 'cover'].join('/');
    return {
      title: album.title,
      artist: album.artist,
      trackids: album.tracks,
      year: album.year,
      images: {
        small: cover,
        medium: cover,
        large: cover
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
      return library.scan().progress(function(track) {
        console.log('scan progress: %s', track.path);
        return res.write(track.path + '\n');
      }).then(function(count) {
        res.write('scanned tracks: ' + count);
        return res.end();
      }).fail(function(err) {
        console.error('scan error', err);
        return next(err);
      }).done();
    },
    tracks: function(req, res, next) {
      return library.tracks(req.query).then(function(tracks) {
        var track;
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
      }).fail(next).done();
    },
    albums: function(req, res, next) {
      return library.albums(req.query).then(function(albums) {
        var album;
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
      }).fail(next).done();
    },
    artists: function(req, res, next) {
      return library.artists(req.query).then(function(artists) {
        var artist;
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
      }).fail(next).done();
    },
    find: function(req, res, next) {
      return library.findTracks({
        artist: req.query.artist,
        title: req.query.title
      }).then(function(tracks) {
        var track;
        return res.send((function() {
          var _i, _len, _results;
          _results = [];
          for (_i = 0, _len = tracks.length; _i < _len; _i++) {
            track = tracks[_i];
            _results.push(mapTrack(track, req));
          }
          return _results;
        })());
      }).fail(next).done();
    },
    play: function(req, res, next) {
      return library.dbfind.track({
        _id: req.params.id
      }).then(function(results) {
        if (!results.length) {
          res.statusCode = 404;
          res.end();
          return;
        }
        return send(req, results[0].path).on('error', next).pipe(res);
      }).fail(next).done();
    },
    trackcover: function(req, res, next) {
      return library.dbfind.track({
        _id: req.params.id
      }).then(function(results) {
        if (!results.length) {
          res.statusCode = 404;
          res.end();
          return;
        }
        return results[0];
      }).then(function(track) {
        var cover, dirpath;
        cover = null;
        if (track.coverpath) {
          cover = track.coverpath;
        }
        if (!cover) {
          dirpath = dirname(track.path);
          cover = getCoverPath(dirpath);
          if (cover) {
            library.db.track.update({
              _id: track._id
            }, {
              $set: {
                coverpath: cover
              }
            }, {}, function(err, num) {
              if (err) {
                throw err;
              }
              return console.log('track cover updated');
            });
          }
        }
        if (!cover) {
          res.statusCode = 404;
          res.end();
          return;
        }
        return send(req, cover, {
          maxAge: 1000 * 60 * 60 * 24 * 30
        }).on('error', next).pipe(res);
      }).fail(next).done();
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
      console.log('setting up app', app);
      basePath = path || '';
      library = new MediaLibary(config);
      app.get('/status', handlers.status);
      app.get('/scan', handlers.scan);
      app.get('/tracks', handlers.tracks);
      app.get('/tracks/:id/cover', handlers.trackcover);
      app.get('/albums', handlers.albums);
      app.get('/albums/:id/cover', handlers.albumcover);
      app.get('/artists', handlers.artists);
      app.get('/find', handlers.find);
      return app.get('/play/:id', handlers.play);
    }
  };

}).call(this);
