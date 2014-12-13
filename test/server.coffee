should = require 'should'
supertest = require 'supertest'
server = require('../lib/server')

config =
  dataPath: './test/'
  paths: ['./test/']
  disableLogs: true

app = server.standalone(config)
request = supertest(app)

describe('server', () ->

  describe('GET /status', () ->
    it('respond with status 200', (done) ->
      request
        .get('/status')
        .expect(200, done)
    )
  )

  describe('GET /tracks', () ->
    it('respond with tracks as json', (done) ->
      request
        .get('/tracks')
        .expect(200)
        .expect('Content-Type', /json/)
        .expect((res) ->
          res.body.should.be.instanceOf(Array)
            .and.have.lengthOf(2)
          return
        )
        .end(done)
    )

    it('tracks have appropriate properties', (done) ->
      request
        .get('/tracks')
        .expect(200)
        .expect('Content-Type', /json/)
        .expect((res) ->
          res.body.should.have.property(0)
            .with.properties(['title', 'artist', 'album', 'url'])
          return
        )
        .end(done)
    )
  )

  describe('GET /tracks?artist=$ARTIST', () ->
    it('respond with tracks matching artist as json', (done) ->
      request
        .get('/tracks?artist=Placebo')
        .expect(200)
        .expect('Content-Type', /json/)
        .expect((res) ->
          res.body.should.be.instanceOf(Array)
            .and.have.lengthOf(1)
          return
        )
        .end(done)
    )
  )

  describe('GET /tracks?title=$TITLE', () ->
    it('respond with tracks matching title as json', (done) ->
      request
        .get('/tracks?title=Kings%20of%20Medicine')
        .expect(200)
        .expect('Content-Type', /json/)
        .expect((res) ->
          res.body.should.be.instanceOf(Array)
            .and.have.lengthOf(1)
          return
        )
        .end(done)
    )
  )

  describe('GET /albums', () ->
    it('respond with albums as json', (done) ->
      request
        .get('/albums')
        .expect(200)
        .expect('Content-Type', /json/)
        .expect((res) ->
          res.body.should.be.instanceOf(Array)
            .and.have.lengthOf(2)
          return
        )
        .end(done)
    )

    it('albums have appropriate properties', (done) ->
      request
        .get('/albums')
        .expect(200)
        .expect('Content-Type', /json/)
        .expect((res) ->
          res.body.should.have.property(0)
            .with.properties(['title', 'artist'])
          return
        )
        .end(done)
    )
  )

  describe('GET /artists', () ->
    it('respond with artists as json', (done) ->
      request
        .get('/artists')
        .expect(200)
        .expect('Content-Type', /json/)
        .expect((res) ->
          res.body.should.be.instanceOf(Array)
            .and.have.lengthOf(2)
          return
        )
        .end(done)
    )

    it('artists have appropriate properties', (done) ->
      request
        .get('/artists')
        .expect(200)
        .expect('Content-Type', /json/)
        .expect((res) ->
          res.body.should.have.property(0)
            .with.properties(['name'])
          return
        )
        .end(done)
    )
  )

  describe('GET /find?title=$TITLE', () ->
    it('respond with found tracks as json', (done) ->
      request
        .get('/find?title=Medicine')
        .expect(200)
        .expect('Content-Type', /json/)
        .expect((res) ->
          res.body.should.be.instanceOf(Array)
            .and.have.lengthOf(1)
          return
        )
        .end(done)
    )
  )

)
