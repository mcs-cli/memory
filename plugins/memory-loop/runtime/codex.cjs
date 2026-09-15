"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/graceful-fs/polyfills.js
var require_polyfills = __commonJS({
  "node_modules/graceful-fs/polyfills.js"(exports2, module2) {
    var constants = require("constants");
    var origCwd = process.cwd;
    var cwd = null;
    var platform = process.env.GRACEFUL_FS_PLATFORM || process.platform;
    process.cwd = function() {
      if (!cwd)
        cwd = origCwd.call(process);
      return cwd;
    };
    try {
      process.cwd();
    } catch (er) {
    }
    if (typeof process.chdir === "function") {
      chdir = process.chdir;
      process.chdir = function(d) {
        cwd = null;
        chdir.call(process, d);
      };
      if (Object.setPrototypeOf) Object.setPrototypeOf(process.chdir, chdir);
    }
    var chdir;
    module2.exports = patch;
    function patch(fs7) {
      if (constants.hasOwnProperty("O_SYMLINK") && process.version.match(/^v0\.6\.[0-2]|^v0\.5\./)) {
        patchLchmod(fs7);
      }
      if (!fs7.lutimes) {
        patchLutimes(fs7);
      }
      fs7.chown = chownFix(fs7.chown);
      fs7.fchown = chownFix(fs7.fchown);
      fs7.lchown = chownFix(fs7.lchown);
      fs7.chmod = chmodFix(fs7.chmod);
      fs7.fchmod = chmodFix(fs7.fchmod);
      fs7.lchmod = chmodFix(fs7.lchmod);
      fs7.chownSync = chownFixSync(fs7.chownSync);
      fs7.fchownSync = chownFixSync(fs7.fchownSync);
      fs7.lchownSync = chownFixSync(fs7.lchownSync);
      fs7.chmodSync = chmodFixSync(fs7.chmodSync);
      fs7.fchmodSync = chmodFixSync(fs7.fchmodSync);
      fs7.lchmodSync = chmodFixSync(fs7.lchmodSync);
      fs7.stat = statFix(fs7.stat);
      fs7.fstat = statFix(fs7.fstat);
      fs7.lstat = statFix(fs7.lstat);
      fs7.statSync = statFixSync(fs7.statSync);
      fs7.fstatSync = statFixSync(fs7.fstatSync);
      fs7.lstatSync = statFixSync(fs7.lstatSync);
      if (fs7.chmod && !fs7.lchmod) {
        fs7.lchmod = function(path7, mode, cb) {
          if (cb) process.nextTick(cb);
        };
        fs7.lchmodSync = function() {
        };
      }
      if (fs7.chown && !fs7.lchown) {
        fs7.lchown = function(path7, uid, gid, cb) {
          if (cb) process.nextTick(cb);
        };
        fs7.lchownSync = function() {
        };
      }
      if (platform === "win32") {
        fs7.rename = typeof fs7.rename !== "function" ? fs7.rename : (function(fs$rename) {
          function rename(from, to, cb) {
            var start = Date.now();
            var backoff = 0;
            fs$rename(from, to, function CB(er) {
              if (er && (er.code === "EACCES" || er.code === "EPERM" || er.code === "EBUSY") && Date.now() - start < 6e4) {
                setTimeout(function() {
                  fs7.stat(to, function(stater, st) {
                    if (stater && stater.code === "ENOENT")
                      fs$rename(from, to, CB);
                    else
                      cb(er);
                  });
                }, backoff);
                if (backoff < 100)
                  backoff += 10;
                return;
              }
              if (cb) cb(er);
            });
          }
          if (Object.setPrototypeOf) Object.setPrototypeOf(rename, fs$rename);
          return rename;
        })(fs7.rename);
      }
      fs7.read = typeof fs7.read !== "function" ? fs7.read : (function(fs$read) {
        function read2(fd, buffer, offset, length, position, callback_) {
          var callback;
          if (callback_ && typeof callback_ === "function") {
            var eagCounter = 0;
            callback = function(er, _, __) {
              if (er && er.code === "EAGAIN" && eagCounter < 10) {
                eagCounter++;
                return fs$read.call(fs7, fd, buffer, offset, length, position, callback);
              }
              callback_.apply(this, arguments);
            };
          }
          return fs$read.call(fs7, fd, buffer, offset, length, position, callback);
        }
        if (Object.setPrototypeOf) Object.setPrototypeOf(read2, fs$read);
        return read2;
      })(fs7.read);
      fs7.readSync = typeof fs7.readSync !== "function" ? fs7.readSync : /* @__PURE__ */ (function(fs$readSync) {
        return function(fd, buffer, offset, length, position) {
          var eagCounter = 0;
          while (true) {
            try {
              return fs$readSync.call(fs7, fd, buffer, offset, length, position);
            } catch (er) {
              if (er.code === "EAGAIN" && eagCounter < 10) {
                eagCounter++;
                continue;
              }
              throw er;
            }
          }
        };
      })(fs7.readSync);
      function patchLchmod(fs8) {
        fs8.lchmod = function(path7, mode, callback) {
          fs8.open(
            path7,
            constants.O_WRONLY | constants.O_SYMLINK,
            mode,
            function(err, fd) {
              if (err) {
                if (callback) callback(err);
                return;
              }
              fs8.fchmod(fd, mode, function(err2) {
                fs8.close(fd, function(err22) {
                  if (callback) callback(err2 || err22);
                });
              });
            }
          );
        };
        fs8.lchmodSync = function(path7, mode) {
          var fd = fs8.openSync(path7, constants.O_WRONLY | constants.O_SYMLINK, mode);
          var threw = true;
          var ret;
          try {
            ret = fs8.fchmodSync(fd, mode);
            threw = false;
          } finally {
            if (threw) {
              try {
                fs8.closeSync(fd);
              } catch (er) {
              }
            } else {
              fs8.closeSync(fd);
            }
          }
          return ret;
        };
      }
      function patchLutimes(fs8) {
        if (constants.hasOwnProperty("O_SYMLINK") && fs8.futimes) {
          fs8.lutimes = function(path7, at, mt, cb) {
            fs8.open(path7, constants.O_SYMLINK, function(er, fd) {
              if (er) {
                if (cb) cb(er);
                return;
              }
              fs8.futimes(fd, at, mt, function(er2) {
                fs8.close(fd, function(er22) {
                  if (cb) cb(er2 || er22);
                });
              });
            });
          };
          fs8.lutimesSync = function(path7, at, mt) {
            var fd = fs8.openSync(path7, constants.O_SYMLINK);
            var ret;
            var threw = true;
            try {
              ret = fs8.futimesSync(fd, at, mt);
              threw = false;
            } finally {
              if (threw) {
                try {
                  fs8.closeSync(fd);
                } catch (er) {
                }
              } else {
                fs8.closeSync(fd);
              }
            }
            return ret;
          };
        } else if (fs8.futimes) {
          fs8.lutimes = function(_a, _b, _c, cb) {
            if (cb) process.nextTick(cb);
          };
          fs8.lutimesSync = function() {
          };
        }
      }
      function chmodFix(orig) {
        if (!orig) return orig;
        return function(target, mode, cb) {
          return orig.call(fs7, target, mode, function(er) {
            if (chownErOk(er)) er = null;
            if (cb) cb.apply(this, arguments);
          });
        };
      }
      function chmodFixSync(orig) {
        if (!orig) return orig;
        return function(target, mode) {
          try {
            return orig.call(fs7, target, mode);
          } catch (er) {
            if (!chownErOk(er)) throw er;
          }
        };
      }
      function chownFix(orig) {
        if (!orig) return orig;
        return function(target, uid, gid, cb) {
          return orig.call(fs7, target, uid, gid, function(er) {
            if (chownErOk(er)) er = null;
            if (cb) cb.apply(this, arguments);
          });
        };
      }
      function chownFixSync(orig) {
        if (!orig) return orig;
        return function(target, uid, gid) {
          try {
            return orig.call(fs7, target, uid, gid);
          } catch (er) {
            if (!chownErOk(er)) throw er;
          }
        };
      }
      function statFix(orig) {
        if (!orig) return orig;
        return function(target, options, cb) {
          if (typeof options === "function") {
            cb = options;
            options = null;
          }
          function callback(er, stats) {
            if (stats) {
              if (stats.uid < 0) stats.uid += 4294967296;
              if (stats.gid < 0) stats.gid += 4294967296;
            }
            if (cb) cb.apply(this, arguments);
          }
          return options ? orig.call(fs7, target, options, callback) : orig.call(fs7, target, callback);
        };
      }
      function statFixSync(orig) {
        if (!orig) return orig;
        return function(target, options) {
          var stats = options ? orig.call(fs7, target, options) : orig.call(fs7, target);
          if (stats) {
            if (stats.uid < 0) stats.uid += 4294967296;
            if (stats.gid < 0) stats.gid += 4294967296;
          }
          return stats;
        };
      }
      function chownErOk(er) {
        if (!er)
          return true;
        if (er.code === "ENOSYS")
          return true;
        var nonroot = !process.getuid || process.getuid() !== 0;
        if (nonroot) {
          if (er.code === "EINVAL" || er.code === "EPERM")
            return true;
        }
        return false;
      }
    }
  }
});

// node_modules/graceful-fs/legacy-streams.js
var require_legacy_streams = __commonJS({
  "node_modules/graceful-fs/legacy-streams.js"(exports2, module2) {
    var Stream = require("stream").Stream;
    module2.exports = legacy;
    function legacy(fs7) {
      return {
        ReadStream,
        WriteStream
      };
      function ReadStream(path7, options) {
        if (!(this instanceof ReadStream)) return new ReadStream(path7, options);
        Stream.call(this);
        var self = this;
        this.path = path7;
        this.fd = null;
        this.readable = true;
        this.paused = false;
        this.flags = "r";
        this.mode = 438;
        this.bufferSize = 64 * 1024;
        options = options || {};
        var keys = Object.keys(options);
        for (var index2 = 0, length = keys.length; index2 < length; index2++) {
          var key = keys[index2];
          this[key] = options[key];
        }
        if (this.encoding) this.setEncoding(this.encoding);
        if (this.start !== void 0) {
          if ("number" !== typeof this.start) {
            throw TypeError("start must be a Number");
          }
          if (this.end === void 0) {
            this.end = Infinity;
          } else if ("number" !== typeof this.end) {
            throw TypeError("end must be a Number");
          }
          if (this.start > this.end) {
            throw new Error("start must be <= end");
          }
          this.pos = this.start;
        }
        if (this.fd !== null) {
          process.nextTick(function() {
            self._read();
          });
          return;
        }
        fs7.open(this.path, this.flags, this.mode, function(err, fd) {
          if (err) {
            self.emit("error", err);
            self.readable = false;
            return;
          }
          self.fd = fd;
          self.emit("open", fd);
          self._read();
        });
      }
      function WriteStream(path7, options) {
        if (!(this instanceof WriteStream)) return new WriteStream(path7, options);
        Stream.call(this);
        this.path = path7;
        this.fd = null;
        this.writable = true;
        this.flags = "w";
        this.encoding = "binary";
        this.mode = 438;
        this.bytesWritten = 0;
        options = options || {};
        var keys = Object.keys(options);
        for (var index2 = 0, length = keys.length; index2 < length; index2++) {
          var key = keys[index2];
          this[key] = options[key];
        }
        if (this.start !== void 0) {
          if ("number" !== typeof this.start) {
            throw TypeError("start must be a Number");
          }
          if (this.start < 0) {
            throw new Error("start must be >= zero");
          }
          this.pos = this.start;
        }
        this.busy = false;
        this._queue = [];
        if (this.fd === null) {
          this._open = fs7.open;
          this._queue.push([this._open, this.path, this.flags, this.mode, void 0]);
          this.flush();
        }
      }
    }
  }
});

// node_modules/graceful-fs/clone.js
var require_clone = __commonJS({
  "node_modules/graceful-fs/clone.js"(exports2, module2) {
    "use strict";
    module2.exports = clone;
    var getPrototypeOf = Object.getPrototypeOf || function(obj) {
      return obj.__proto__;
    };
    function clone(obj) {
      if (obj === null || typeof obj !== "object")
        return obj;
      if (obj instanceof Object)
        var copy = { __proto__: getPrototypeOf(obj) };
      else
        var copy = /* @__PURE__ */ Object.create(null);
      Object.getOwnPropertyNames(obj).forEach(function(key) {
        Object.defineProperty(copy, key, Object.getOwnPropertyDescriptor(obj, key));
      });
      return copy;
    }
  }
});

// node_modules/graceful-fs/graceful-fs.js
var require_graceful_fs = __commonJS({
  "node_modules/graceful-fs/graceful-fs.js"(exports2, module2) {
    var fs7 = require("fs");
    var polyfills = require_polyfills();
    var legacy = require_legacy_streams();
    var clone = require_clone();
    var util = require("util");
    var gracefulQueue;
    var previousSymbol;
    if (typeof Symbol === "function" && typeof Symbol.for === "function") {
      gracefulQueue = Symbol.for("graceful-fs.queue");
      previousSymbol = Symbol.for("graceful-fs.previous");
    } else {
      gracefulQueue = "___graceful-fs.queue";
      previousSymbol = "___graceful-fs.previous";
    }
    function noop() {
    }
    function publishQueue(context2, queue2) {
      Object.defineProperty(context2, gracefulQueue, {
        get: function() {
          return queue2;
        }
      });
    }
    var debug = noop;
    if (util.debuglog)
      debug = util.debuglog("gfs4");
    else if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || ""))
      debug = function() {
        var m = util.format.apply(util, arguments);
        m = "GFS4: " + m.split(/\n/).join("\nGFS4: ");
        console.error(m);
      };
    if (!fs7[gracefulQueue]) {
      queue = global[gracefulQueue] || [];
      publishQueue(fs7, queue);
      fs7.close = (function(fs$close) {
        function close(fd, cb) {
          return fs$close.call(fs7, fd, function(err) {
            if (!err) {
              resetQueue();
            }
            if (typeof cb === "function")
              cb.apply(this, arguments);
          });
        }
        Object.defineProperty(close, previousSymbol, {
          value: fs$close
        });
        return close;
      })(fs7.close);
      fs7.closeSync = (function(fs$closeSync) {
        function closeSync(fd) {
          fs$closeSync.apply(fs7, arguments);
          resetQueue();
        }
        Object.defineProperty(closeSync, previousSymbol, {
          value: fs$closeSync
        });
        return closeSync;
      })(fs7.closeSync);
      if (/\bgfs4\b/i.test(process.env.NODE_DEBUG || "")) {
        process.on("exit", function() {
          debug(fs7[gracefulQueue]);
          require("assert").equal(fs7[gracefulQueue].length, 0);
        });
      }
    }
    var queue;
    if (!global[gracefulQueue]) {
      publishQueue(global, fs7[gracefulQueue]);
    }
    module2.exports = patch(clone(fs7));
    if (process.env.TEST_GRACEFUL_FS_GLOBAL_PATCH && !fs7.__patched) {
      module2.exports = patch(fs7);
      fs7.__patched = true;
    }
    function patch(fs8) {
      polyfills(fs8);
      fs8.gracefulify = patch;
      fs8.createReadStream = createReadStream;
      fs8.createWriteStream = createWriteStream;
      var fs$readFile = fs8.readFile;
      fs8.readFile = readFile;
      function readFile(path7, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        return go$readFile(path7, options, cb);
        function go$readFile(path8, options2, cb2, startTime) {
          return fs$readFile(path8, options2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$readFile, [path8, options2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$writeFile = fs8.writeFile;
      fs8.writeFile = writeFile;
      function writeFile(path7, data, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        return go$writeFile(path7, data, options, cb);
        function go$writeFile(path8, data2, options2, cb2, startTime) {
          return fs$writeFile(path8, data2, options2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$writeFile, [path8, data2, options2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$appendFile = fs8.appendFile;
      if (fs$appendFile)
        fs8.appendFile = appendFile;
      function appendFile(path7, data, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        return go$appendFile(path7, data, options, cb);
        function go$appendFile(path8, data2, options2, cb2, startTime) {
          return fs$appendFile(path8, data2, options2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$appendFile, [path8, data2, options2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$copyFile = fs8.copyFile;
      if (fs$copyFile)
        fs8.copyFile = copyFile;
      function copyFile(src, dest, flags, cb) {
        if (typeof flags === "function") {
          cb = flags;
          flags = 0;
        }
        return go$copyFile(src, dest, flags, cb);
        function go$copyFile(src2, dest2, flags2, cb2, startTime) {
          return fs$copyFile(src2, dest2, flags2, function(err) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$copyFile, [src2, dest2, flags2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      var fs$readdir = fs8.readdir;
      fs8.readdir = readdir;
      var noReaddirOptionVersions = /^v[0-5]\./;
      function readdir(path7, options, cb) {
        if (typeof options === "function")
          cb = options, options = null;
        var go$readdir = noReaddirOptionVersions.test(process.version) ? function go$readdir2(path8, options2, cb2, startTime) {
          return fs$readdir(path8, fs$readdirCallback(
            path8,
            options2,
            cb2,
            startTime
          ));
        } : function go$readdir2(path8, options2, cb2, startTime) {
          return fs$readdir(path8, options2, fs$readdirCallback(
            path8,
            options2,
            cb2,
            startTime
          ));
        };
        return go$readdir(path7, options, cb);
        function fs$readdirCallback(path8, options2, cb2, startTime) {
          return function(err, files) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([
                go$readdir,
                [path8, options2, cb2],
                err,
                startTime || Date.now(),
                Date.now()
              ]);
            else {
              if (files && files.sort)
                files.sort();
              if (typeof cb2 === "function")
                cb2.call(this, err, files);
            }
          };
        }
      }
      if (process.version.substr(0, 4) === "v0.8") {
        var legStreams = legacy(fs8);
        ReadStream = legStreams.ReadStream;
        WriteStream = legStreams.WriteStream;
      }
      var fs$ReadStream = fs8.ReadStream;
      if (fs$ReadStream) {
        ReadStream.prototype = Object.create(fs$ReadStream.prototype);
        ReadStream.prototype.open = ReadStream$open;
      }
      var fs$WriteStream = fs8.WriteStream;
      if (fs$WriteStream) {
        WriteStream.prototype = Object.create(fs$WriteStream.prototype);
        WriteStream.prototype.open = WriteStream$open;
      }
      Object.defineProperty(fs8, "ReadStream", {
        get: function() {
          return ReadStream;
        },
        set: function(val) {
          ReadStream = val;
        },
        enumerable: true,
        configurable: true
      });
      Object.defineProperty(fs8, "WriteStream", {
        get: function() {
          return WriteStream;
        },
        set: function(val) {
          WriteStream = val;
        },
        enumerable: true,
        configurable: true
      });
      var FileReadStream = ReadStream;
      Object.defineProperty(fs8, "FileReadStream", {
        get: function() {
          return FileReadStream;
        },
        set: function(val) {
          FileReadStream = val;
        },
        enumerable: true,
        configurable: true
      });
      var FileWriteStream = WriteStream;
      Object.defineProperty(fs8, "FileWriteStream", {
        get: function() {
          return FileWriteStream;
        },
        set: function(val) {
          FileWriteStream = val;
        },
        enumerable: true,
        configurable: true
      });
      function ReadStream(path7, options) {
        if (this instanceof ReadStream)
          return fs$ReadStream.apply(this, arguments), this;
        else
          return ReadStream.apply(Object.create(ReadStream.prototype), arguments);
      }
      function ReadStream$open() {
        var that = this;
        open(that.path, that.flags, that.mode, function(err, fd) {
          if (err) {
            if (that.autoClose)
              that.destroy();
            that.emit("error", err);
          } else {
            that.fd = fd;
            that.emit("open", fd);
            that.read();
          }
        });
      }
      function WriteStream(path7, options) {
        if (this instanceof WriteStream)
          return fs$WriteStream.apply(this, arguments), this;
        else
          return WriteStream.apply(Object.create(WriteStream.prototype), arguments);
      }
      function WriteStream$open() {
        var that = this;
        open(that.path, that.flags, that.mode, function(err, fd) {
          if (err) {
            that.destroy();
            that.emit("error", err);
          } else {
            that.fd = fd;
            that.emit("open", fd);
          }
        });
      }
      function createReadStream(path7, options) {
        return new fs8.ReadStream(path7, options);
      }
      function createWriteStream(path7, options) {
        return new fs8.WriteStream(path7, options);
      }
      var fs$open = fs8.open;
      fs8.open = open;
      function open(path7, flags, mode, cb) {
        if (typeof mode === "function")
          cb = mode, mode = null;
        return go$open(path7, flags, mode, cb);
        function go$open(path8, flags2, mode2, cb2, startTime) {
          return fs$open(path8, flags2, mode2, function(err, fd) {
            if (err && (err.code === "EMFILE" || err.code === "ENFILE"))
              enqueue([go$open, [path8, flags2, mode2, cb2], err, startTime || Date.now(), Date.now()]);
            else {
              if (typeof cb2 === "function")
                cb2.apply(this, arguments);
            }
          });
        }
      }
      return fs8;
    }
    function enqueue(elem) {
      debug("ENQUEUE", elem[0].name, elem[1]);
      fs7[gracefulQueue].push(elem);
      retry();
    }
    var retryTimer;
    function resetQueue() {
      var now = Date.now();
      for (var i = 0; i < fs7[gracefulQueue].length; ++i) {
        if (fs7[gracefulQueue][i].length > 2) {
          fs7[gracefulQueue][i][3] = now;
          fs7[gracefulQueue][i][4] = now;
        }
      }
      retry();
    }
    function retry() {
      clearTimeout(retryTimer);
      retryTimer = void 0;
      if (fs7[gracefulQueue].length === 0)
        return;
      var elem = fs7[gracefulQueue].shift();
      var fn = elem[0];
      var args = elem[1];
      var err = elem[2];
      var startTime = elem[3];
      var lastTime = elem[4];
      if (startTime === void 0) {
        debug("RETRY", fn.name, args);
        fn.apply(null, args);
      } else if (Date.now() - startTime >= 6e4) {
        debug("TIMEOUT", fn.name, args);
        var cb = args.pop();
        if (typeof cb === "function")
          cb.call(null, err);
      } else {
        var sinceAttempt = Date.now() - lastTime;
        var sinceStart = Math.max(lastTime - startTime, 1);
        var desiredDelay = Math.min(sinceStart * 1.2, 100);
        if (sinceAttempt >= desiredDelay) {
          debug("RETRY", fn.name, args);
          fn.apply(null, args.concat([startTime]));
        } else {
          fs7[gracefulQueue].push(elem);
        }
      }
      if (retryTimer === void 0) {
        retryTimer = setTimeout(retry, 0);
      }
    }
  }
});

// node_modules/retry/lib/retry_operation.js
var require_retry_operation = __commonJS({
  "node_modules/retry/lib/retry_operation.js"(exports2, module2) {
    function RetryOperation(timeouts, options) {
      if (typeof options === "boolean") {
        options = { forever: options };
      }
      this._originalTimeouts = JSON.parse(JSON.stringify(timeouts));
      this._timeouts = timeouts;
      this._options = options || {};
      this._maxRetryTime = options && options.maxRetryTime || Infinity;
      this._fn = null;
      this._errors = [];
      this._attempts = 1;
      this._operationTimeout = null;
      this._operationTimeoutCb = null;
      this._timeout = null;
      this._operationStart = null;
      if (this._options.forever) {
        this._cachedTimeouts = this._timeouts.slice(0);
      }
    }
    module2.exports = RetryOperation;
    RetryOperation.prototype.reset = function() {
      this._attempts = 1;
      this._timeouts = this._originalTimeouts;
    };
    RetryOperation.prototype.stop = function() {
      if (this._timeout) {
        clearTimeout(this._timeout);
      }
      this._timeouts = [];
      this._cachedTimeouts = null;
    };
    RetryOperation.prototype.retry = function(err) {
      if (this._timeout) {
        clearTimeout(this._timeout);
      }
      if (!err) {
        return false;
      }
      var currentTime = (/* @__PURE__ */ new Date()).getTime();
      if (err && currentTime - this._operationStart >= this._maxRetryTime) {
        this._errors.unshift(new Error("RetryOperation timeout occurred"));
        return false;
      }
      this._errors.push(err);
      var timeout = this._timeouts.shift();
      if (timeout === void 0) {
        if (this._cachedTimeouts) {
          this._errors.splice(this._errors.length - 1, this._errors.length);
          this._timeouts = this._cachedTimeouts.slice(0);
          timeout = this._timeouts.shift();
        } else {
          return false;
        }
      }
      var self = this;
      var timer = setTimeout(function() {
        self._attempts++;
        if (self._operationTimeoutCb) {
          self._timeout = setTimeout(function() {
            self._operationTimeoutCb(self._attempts);
          }, self._operationTimeout);
          if (self._options.unref) {
            self._timeout.unref();
          }
        }
        self._fn(self._attempts);
      }, timeout);
      if (this._options.unref) {
        timer.unref();
      }
      return true;
    };
    RetryOperation.prototype.attempt = function(fn, timeoutOps) {
      this._fn = fn;
      if (timeoutOps) {
        if (timeoutOps.timeout) {
          this._operationTimeout = timeoutOps.timeout;
        }
        if (timeoutOps.cb) {
          this._operationTimeoutCb = timeoutOps.cb;
        }
      }
      var self = this;
      if (this._operationTimeoutCb) {
        this._timeout = setTimeout(function() {
          self._operationTimeoutCb();
        }, self._operationTimeout);
      }
      this._operationStart = (/* @__PURE__ */ new Date()).getTime();
      this._fn(this._attempts);
    };
    RetryOperation.prototype.try = function(fn) {
      console.log("Using RetryOperation.try() is deprecated");
      this.attempt(fn);
    };
    RetryOperation.prototype.start = function(fn) {
      console.log("Using RetryOperation.start() is deprecated");
      this.attempt(fn);
    };
    RetryOperation.prototype.start = RetryOperation.prototype.try;
    RetryOperation.prototype.errors = function() {
      return this._errors;
    };
    RetryOperation.prototype.attempts = function() {
      return this._attempts;
    };
    RetryOperation.prototype.mainError = function() {
      if (this._errors.length === 0) {
        return null;
      }
      var counts = {};
      var mainError = null;
      var mainErrorCount = 0;
      for (var i = 0; i < this._errors.length; i++) {
        var error = this._errors[i];
        var message = error.message;
        var count = (counts[message] || 0) + 1;
        counts[message] = count;
        if (count >= mainErrorCount) {
          mainError = error;
          mainErrorCount = count;
        }
      }
      return mainError;
    };
  }
});

// node_modules/retry/lib/retry.js
var require_retry = __commonJS({
  "node_modules/retry/lib/retry.js"(exports2) {
    var RetryOperation = require_retry_operation();
    exports2.operation = function(options) {
      var timeouts = exports2.timeouts(options);
      return new RetryOperation(timeouts, {
        forever: options && options.forever,
        unref: options && options.unref,
        maxRetryTime: options && options.maxRetryTime
      });
    };
    exports2.timeouts = function(options) {
      if (options instanceof Array) {
        return [].concat(options);
      }
      var opts = {
        retries: 10,
        factor: 2,
        minTimeout: 1 * 1e3,
        maxTimeout: Infinity,
        randomize: false
      };
      for (var key in options) {
        opts[key] = options[key];
      }
      if (opts.minTimeout > opts.maxTimeout) {
        throw new Error("minTimeout is greater than maxTimeout");
      }
      var timeouts = [];
      for (var i = 0; i < opts.retries; i++) {
        timeouts.push(this.createTimeout(i, opts));
      }
      if (options && options.forever && !timeouts.length) {
        timeouts.push(this.createTimeout(i, opts));
      }
      timeouts.sort(function(a, b) {
        return a - b;
      });
      return timeouts;
    };
    exports2.createTimeout = function(attempt, opts) {
      var random = opts.randomize ? Math.random() + 1 : 1;
      var timeout = Math.round(random * opts.minTimeout * Math.pow(opts.factor, attempt));
      timeout = Math.min(timeout, opts.maxTimeout);
      return timeout;
    };
    exports2.wrap = function(obj, options, methods) {
      if (options instanceof Array) {
        methods = options;
        options = null;
      }
      if (!methods) {
        methods = [];
        for (var key in obj) {
          if (typeof obj[key] === "function") {
            methods.push(key);
          }
        }
      }
      for (var i = 0; i < methods.length; i++) {
        var method = methods[i];
        var original = obj[method];
        obj[method] = function retryWrapper(original2) {
          var op = exports2.operation(options);
          var args = Array.prototype.slice.call(arguments, 1);
          var callback = args.pop();
          args.push(function(err) {
            if (op.retry(err)) {
              return;
            }
            if (err) {
              arguments[0] = op.mainError();
            }
            callback.apply(this, arguments);
          });
          op.attempt(function() {
            original2.apply(obj, args);
          });
        }.bind(obj, original);
        obj[method].options = options;
      }
    };
  }
});

// node_modules/retry/index.js
var require_retry2 = __commonJS({
  "node_modules/retry/index.js"(exports2, module2) {
    module2.exports = require_retry();
  }
});

// node_modules/signal-exit/signals.js
var require_signals = __commonJS({
  "node_modules/signal-exit/signals.js"(exports2, module2) {
    module2.exports = [
      "SIGABRT",
      "SIGALRM",
      "SIGHUP",
      "SIGINT",
      "SIGTERM"
    ];
    if (process.platform !== "win32") {
      module2.exports.push(
        "SIGVTALRM",
        "SIGXCPU",
        "SIGXFSZ",
        "SIGUSR2",
        "SIGTRAP",
        "SIGSYS",
        "SIGQUIT",
        "SIGIOT"
        // should detect profiler and enable/disable accordingly.
        // see #21
        // 'SIGPROF'
      );
    }
    if (process.platform === "linux") {
      module2.exports.push(
        "SIGIO",
        "SIGPOLL",
        "SIGPWR",
        "SIGSTKFLT",
        "SIGUNUSED"
      );
    }
  }
});

// node_modules/signal-exit/index.js
var require_signal_exit = __commonJS({
  "node_modules/signal-exit/index.js"(exports2, module2) {
    var process2 = global.process;
    var processOk = function(process3) {
      return process3 && typeof process3 === "object" && typeof process3.removeListener === "function" && typeof process3.emit === "function" && typeof process3.reallyExit === "function" && typeof process3.listeners === "function" && typeof process3.kill === "function" && typeof process3.pid === "number" && typeof process3.on === "function";
    };
    if (!processOk(process2)) {
      module2.exports = function() {
        return function() {
        };
      };
    } else {
      assert = require("assert");
      signals = require_signals();
      isWin = /^win/i.test(process2.platform);
      EE = require("events");
      if (typeof EE !== "function") {
        EE = EE.EventEmitter;
      }
      if (process2.__signal_exit_emitter__) {
        emitter = process2.__signal_exit_emitter__;
      } else {
        emitter = process2.__signal_exit_emitter__ = new EE();
        emitter.count = 0;
        emitter.emitted = {};
      }
      if (!emitter.infinite) {
        emitter.setMaxListeners(Infinity);
        emitter.infinite = true;
      }
      module2.exports = function(cb, opts) {
        if (!processOk(global.process)) {
          return function() {
          };
        }
        assert.equal(typeof cb, "function", "a callback must be provided for exit handler");
        if (loaded === false) {
          load();
        }
        var ev = "exit";
        if (opts && opts.alwaysLast) {
          ev = "afterexit";
        }
        var remove = function() {
          emitter.removeListener(ev, cb);
          if (emitter.listeners("exit").length === 0 && emitter.listeners("afterexit").length === 0) {
            unload();
          }
        };
        emitter.on(ev, cb);
        return remove;
      };
      unload = function unload2() {
        if (!loaded || !processOk(global.process)) {
          return;
        }
        loaded = false;
        signals.forEach(function(sig) {
          try {
            process2.removeListener(sig, sigListeners[sig]);
          } catch (er) {
          }
        });
        process2.emit = originalProcessEmit;
        process2.reallyExit = originalProcessReallyExit;
        emitter.count -= 1;
      };
      module2.exports.unload = unload;
      emit = function emit2(event, code, signal) {
        if (emitter.emitted[event]) {
          return;
        }
        emitter.emitted[event] = true;
        emitter.emit(event, code, signal);
      };
      sigListeners = {};
      signals.forEach(function(sig) {
        sigListeners[sig] = function listener() {
          if (!processOk(global.process)) {
            return;
          }
          var listeners = process2.listeners(sig);
          if (listeners.length === emitter.count) {
            unload();
            emit("exit", null, sig);
            emit("afterexit", null, sig);
            if (isWin && sig === "SIGHUP") {
              sig = "SIGINT";
            }
            process2.kill(process2.pid, sig);
          }
        };
      });
      module2.exports.signals = function() {
        return signals;
      };
      loaded = false;
      load = function load2() {
        if (loaded || !processOk(global.process)) {
          return;
        }
        loaded = true;
        emitter.count += 1;
        signals = signals.filter(function(sig) {
          try {
            process2.on(sig, sigListeners[sig]);
            return true;
          } catch (er) {
            return false;
          }
        });
        process2.emit = processEmit;
        process2.reallyExit = processReallyExit;
      };
      module2.exports.load = load;
      originalProcessReallyExit = process2.reallyExit;
      processReallyExit = function processReallyExit2(code) {
        if (!processOk(global.process)) {
          return;
        }
        process2.exitCode = code || /* istanbul ignore next */
        0;
        emit("exit", process2.exitCode, null);
        emit("afterexit", process2.exitCode, null);
        originalProcessReallyExit.call(process2, process2.exitCode);
      };
      originalProcessEmit = process2.emit;
      processEmit = function processEmit2(ev, arg) {
        if (ev === "exit" && processOk(global.process)) {
          if (arg !== void 0) {
            process2.exitCode = arg;
          }
          var ret = originalProcessEmit.apply(this, arguments);
          emit("exit", process2.exitCode, null);
          emit("afterexit", process2.exitCode, null);
          return ret;
        } else {
          return originalProcessEmit.apply(this, arguments);
        }
      };
    }
    var assert;
    var signals;
    var isWin;
    var EE;
    var emitter;
    var unload;
    var emit;
    var sigListeners;
    var loaded;
    var load;
    var originalProcessReallyExit;
    var processReallyExit;
    var originalProcessEmit;
    var processEmit;
  }
});

// node_modules/proper-lockfile/lib/mtime-precision.js
var require_mtime_precision = __commonJS({
  "node_modules/proper-lockfile/lib/mtime-precision.js"(exports2, module2) {
    "use strict";
    var cacheSymbol = Symbol();
    function probe(file, fs7, callback) {
      const cachedPrecision = fs7[cacheSymbol];
      if (cachedPrecision) {
        return fs7.stat(file, (err, stat) => {
          if (err) {
            return callback(err);
          }
          callback(null, stat.mtime, cachedPrecision);
        });
      }
      const mtime = new Date(Math.ceil(Date.now() / 1e3) * 1e3 + 5);
      fs7.utimes(file, mtime, mtime, (err) => {
        if (err) {
          return callback(err);
        }
        fs7.stat(file, (err2, stat) => {
          if (err2) {
            return callback(err2);
          }
          const precision = stat.mtime.getTime() % 1e3 === 0 ? "s" : "ms";
          Object.defineProperty(fs7, cacheSymbol, { value: precision });
          callback(null, stat.mtime, precision);
        });
      });
    }
    function getMtime(precision) {
      let now = Date.now();
      if (precision === "s") {
        now = Math.ceil(now / 1e3) * 1e3;
      }
      return new Date(now);
    }
    module2.exports.probe = probe;
    module2.exports.getMtime = getMtime;
  }
});

// node_modules/proper-lockfile/lib/lockfile.js
var require_lockfile = __commonJS({
  "node_modules/proper-lockfile/lib/lockfile.js"(exports2, module2) {
    "use strict";
    var path7 = require("path");
    var fs7 = require_graceful_fs();
    var retry = require_retry2();
    var onExit = require_signal_exit();
    var mtimePrecision = require_mtime_precision();
    var locks = {};
    function getLockFile(file, options) {
      return options.lockfilePath || `${file}.lock`;
    }
    function resolveCanonicalPath(file, options, callback) {
      if (!options.realpath) {
        return callback(null, path7.resolve(file));
      }
      options.fs.realpath(file, callback);
    }
    function acquireLock(file, options, callback) {
      const lockfilePath = getLockFile(file, options);
      options.fs.mkdir(lockfilePath, (err) => {
        if (!err) {
          return mtimePrecision.probe(lockfilePath, options.fs, (err2, mtime, mtimePrecision2) => {
            if (err2) {
              options.fs.rmdir(lockfilePath, () => {
              });
              return callback(err2);
            }
            callback(null, mtime, mtimePrecision2);
          });
        }
        if (err.code !== "EEXIST") {
          return callback(err);
        }
        if (options.stale <= 0) {
          return callback(Object.assign(new Error("Lock file is already being held"), { code: "ELOCKED", file }));
        }
        options.fs.stat(lockfilePath, (err2, stat) => {
          if (err2) {
            if (err2.code === "ENOENT") {
              return acquireLock(file, { ...options, stale: 0 }, callback);
            }
            return callback(err2);
          }
          if (!isLockStale(stat, options)) {
            return callback(Object.assign(new Error("Lock file is already being held"), { code: "ELOCKED", file }));
          }
          removeLock(file, options, (err3) => {
            if (err3) {
              return callback(err3);
            }
            acquireLock(file, { ...options, stale: 0 }, callback);
          });
        });
      });
    }
    function isLockStale(stat, options) {
      return stat.mtime.getTime() < Date.now() - options.stale;
    }
    function removeLock(file, options, callback) {
      options.fs.rmdir(getLockFile(file, options), (err) => {
        if (err && err.code !== "ENOENT") {
          return callback(err);
        }
        callback();
      });
    }
    function updateLock(file, options) {
      const lock2 = locks[file];
      if (lock2.updateTimeout) {
        return;
      }
      lock2.updateDelay = lock2.updateDelay || options.update;
      lock2.updateTimeout = setTimeout(() => {
        lock2.updateTimeout = null;
        options.fs.stat(lock2.lockfilePath, (err, stat) => {
          const isOverThreshold = lock2.lastUpdate + options.stale < Date.now();
          if (err) {
            if (err.code === "ENOENT" || isOverThreshold) {
              return setLockAsCompromised(file, lock2, Object.assign(err, { code: "ECOMPROMISED" }));
            }
            lock2.updateDelay = 1e3;
            return updateLock(file, options);
          }
          const isMtimeOurs = lock2.mtime.getTime() === stat.mtime.getTime();
          if (!isMtimeOurs) {
            return setLockAsCompromised(
              file,
              lock2,
              Object.assign(
                new Error("Unable to update lock within the stale threshold"),
                { code: "ECOMPROMISED" }
              )
            );
          }
          const mtime = mtimePrecision.getMtime(lock2.mtimePrecision);
          options.fs.utimes(lock2.lockfilePath, mtime, mtime, (err2) => {
            const isOverThreshold2 = lock2.lastUpdate + options.stale < Date.now();
            if (lock2.released) {
              return;
            }
            if (err2) {
              if (err2.code === "ENOENT" || isOverThreshold2) {
                return setLockAsCompromised(file, lock2, Object.assign(err2, { code: "ECOMPROMISED" }));
              }
              lock2.updateDelay = 1e3;
              return updateLock(file, options);
            }
            lock2.mtime = mtime;
            lock2.lastUpdate = Date.now();
            lock2.updateDelay = null;
            updateLock(file, options);
          });
        });
      }, lock2.updateDelay);
      if (lock2.updateTimeout.unref) {
        lock2.updateTimeout.unref();
      }
    }
    function setLockAsCompromised(file, lock2, err) {
      lock2.released = true;
      if (lock2.updateTimeout) {
        clearTimeout(lock2.updateTimeout);
      }
      if (locks[file] === lock2) {
        delete locks[file];
      }
      lock2.options.onCompromised(err);
    }
    function lock(file, options, callback) {
      options = {
        stale: 1e4,
        update: null,
        realpath: true,
        retries: 0,
        fs: fs7,
        onCompromised: (err) => {
          throw err;
        },
        ...options
      };
      options.retries = options.retries || 0;
      options.retries = typeof options.retries === "number" ? { retries: options.retries } : options.retries;
      options.stale = Math.max(options.stale || 0, 2e3);
      options.update = options.update == null ? options.stale / 2 : options.update || 0;
      options.update = Math.max(Math.min(options.update, options.stale / 2), 1e3);
      resolveCanonicalPath(file, options, (err, file2) => {
        if (err) {
          return callback(err);
        }
        const operation = retry.operation(options.retries);
        operation.attempt(() => {
          acquireLock(file2, options, (err2, mtime, mtimePrecision2) => {
            if (operation.retry(err2)) {
              return;
            }
            if (err2) {
              return callback(operation.mainError());
            }
            const lock2 = locks[file2] = {
              lockfilePath: getLockFile(file2, options),
              mtime,
              mtimePrecision: mtimePrecision2,
              options,
              lastUpdate: Date.now()
            };
            updateLock(file2, options);
            callback(null, (releasedCallback) => {
              if (lock2.released) {
                return releasedCallback && releasedCallback(Object.assign(new Error("Lock is already released"), { code: "ERELEASED" }));
              }
              unlock(file2, { ...options, realpath: false }, releasedCallback);
            });
          });
        });
      });
    }
    function unlock(file, options, callback) {
      options = {
        fs: fs7,
        realpath: true,
        ...options
      };
      resolveCanonicalPath(file, options, (err, file2) => {
        if (err) {
          return callback(err);
        }
        const lock2 = locks[file2];
        if (!lock2) {
          return callback(Object.assign(new Error("Lock is not acquired/owned by you"), { code: "ENOTACQUIRED" }));
        }
        lock2.updateTimeout && clearTimeout(lock2.updateTimeout);
        lock2.released = true;
        delete locks[file2];
        removeLock(file2, options, callback);
      });
    }
    function check(file, options, callback) {
      options = {
        stale: 1e4,
        realpath: true,
        fs: fs7,
        ...options
      };
      options.stale = Math.max(options.stale || 0, 2e3);
      resolveCanonicalPath(file, options, (err, file2) => {
        if (err) {
          return callback(err);
        }
        options.fs.stat(getLockFile(file2, options), (err2, stat) => {
          if (err2) {
            return err2.code === "ENOENT" ? callback(null, false) : callback(err2);
          }
          return callback(null, !isLockStale(stat, options));
        });
      });
    }
    function getLocks() {
      return locks;
    }
    onExit(() => {
      for (const file in locks) {
        const options = locks[file].options;
        try {
          options.fs.rmdirSync(getLockFile(file, options));
        } catch (e) {
        }
      }
    });
    module2.exports.lock = lock;
    module2.exports.unlock = unlock;
    module2.exports.check = check;
    module2.exports.getLocks = getLocks;
  }
});

// node_modules/proper-lockfile/lib/adapter.js
var require_adapter = __commonJS({
  "node_modules/proper-lockfile/lib/adapter.js"(exports2, module2) {
    "use strict";
    var fs7 = require_graceful_fs();
    function createSyncFs(fs8) {
      const methods = ["mkdir", "realpath", "stat", "rmdir", "utimes"];
      const newFs = { ...fs8 };
      methods.forEach((method) => {
        newFs[method] = (...args) => {
          const callback = args.pop();
          let ret;
          try {
            ret = fs8[`${method}Sync`](...args);
          } catch (err) {
            return callback(err);
          }
          callback(null, ret);
        };
      });
      return newFs;
    }
    function toPromise(method) {
      return (...args) => new Promise((resolve, reject) => {
        args.push((err, result) => {
          if (err) {
            reject(err);
          } else {
            resolve(result);
          }
        });
        method(...args);
      });
    }
    function toSync(method) {
      return (...args) => {
        let err;
        let result;
        args.push((_err, _result) => {
          err = _err;
          result = _result;
        });
        method(...args);
        if (err) {
          throw err;
        }
        return result;
      };
    }
    function toSyncOptions(options) {
      options = { ...options };
      options.fs = createSyncFs(options.fs || fs7);
      if (typeof options.retries === "number" && options.retries > 0 || options.retries && typeof options.retries.retries === "number" && options.retries.retries > 0) {
        throw Object.assign(new Error("Cannot use retries with the sync api"), { code: "ESYNC" });
      }
      return options;
    }
    module2.exports = {
      toPromise,
      toSync,
      toSyncOptions
    };
  }
});

// node_modules/proper-lockfile/index.js
var require_proper_lockfile = __commonJS({
  "node_modules/proper-lockfile/index.js"(exports2, module2) {
    "use strict";
    var lockfile2 = require_lockfile();
    var { toPromise, toSync, toSyncOptions } = require_adapter();
    async function lock(file, options) {
      const release = await toPromise(lockfile2.lock)(file, options);
      return toPromise(release);
    }
    function lockSync(file, options) {
      const release = toSync(lockfile2.lock)(file, toSyncOptions(options));
      return toSync(release);
    }
    function unlock(file, options) {
      return toPromise(lockfile2.unlock)(file, options);
    }
    function unlockSync(file, options) {
      return toSync(lockfile2.unlock)(file, toSyncOptions(options));
    }
    function check(file, options) {
      return toPromise(lockfile2.check)(file, options);
    }
    function checkSync(file, options) {
      return toSync(lockfile2.check)(file, toSyncOptions(options));
    }
    module2.exports = lock;
    module2.exports.lock = lock;
    module2.exports.unlock = unlock;
    module2.exports.lockSync = lockSync;
    module2.exports.unlockSync = unlockSync;
    module2.exports.check = check;
    module2.exports.checkSync = checkSync;
  }
});

// src/codex/main.ts
var import_node_fs6 = __toESM(require("node:fs"), 1);
var import_node_path6 = __toESM(require("node:path"), 1);
var import_node_child_process3 = require("node:child_process");

// src/codex/hooks.ts
var import_node_fs3 = __toESM(require("node:fs"), 1);
var import_node_path3 = __toESM(require("node:path"), 1);
var import_node_crypto3 = __toESM(require("node:crypto"), 1);

// src/codex/brief.ts
var import_node_fs2 = __toESM(require("node:fs"), 1);
var import_node_path2 = __toESM(require("node:path"), 1);
var import_node_crypto2 = __toESM(require("node:crypto"), 1);
var import_node_readline = __toESM(require("node:readline"), 1);

// src/codex/state.ts
var import_node_fs = __toESM(require("node:fs"), 1);
var import_node_path = __toESM(require("node:path"), 1);
var import_node_os = __toESM(require("node:os"), 1);
var import_node_crypto = __toESM(require("node:crypto"), 1);
var import_node_child_process = require("node:child_process");
var import_proper_lockfile = __toESM(require_proper_lockfile(), 1);
var MODEL = "hf:Qwen/Qwen3-Embedding-0.6B-GGUF/Qwen3-Embedding-0.6B-Q8_0.gguf";
var MODES = ["enforce", "warn", "observe", "off"];
var home = () => process.env.CODEX_HOME || import_node_path.default.join(import_node_os.default.homedir(), ".codex");
var stateDir = (root) => import_node_path.default.join(root, ".codex/.memory-loop");
function project(cwd = process.cwd()) {
  const result = (0, import_node_child_process.spawnSync)("git", ["-C", cwd, "rev-parse", "--show-toplevel"], { encoding: "utf8" });
  return import_node_fs.default.realpathSync(result.status === 0 ? result.stdout.trim() : cwd);
}
function read(file, fallback) {
  try {
    return JSON.parse(import_node_fs.default.readFileSync(file, "utf8"));
  } catch (e) {
    if (e.code === "ENOENT") return fallback;
    throw e;
  }
}
function atomic(file, content) {
  import_node_fs.default.mkdirSync(import_node_path.default.dirname(file), { recursive: true, mode: 448 });
  const temp = import_node_path.default.join(import_node_path.default.dirname(file), "." + import_node_path.default.basename(file) + "." + import_node_crypto.default.randomUUID());
  const fd = import_node_fs.default.openSync(temp, "wx", 384);
  try {
    try {
      import_node_fs.default.writeFileSync(fd, content);
      import_node_fs.default.fsyncSync(fd);
    } finally {
      import_node_fs.default.closeSync(fd);
    }
    import_node_fs.default.renameSync(temp, file);
  } finally {
    import_node_fs.default.rmSync(temp, { force: true });
  }
}
var write = (file, data) => atomic(file, JSON.stringify(data) + "\n");
function locked(file, work) {
  import_node_fs.default.mkdirSync(import_node_path.default.dirname(file), { recursive: true, mode: 448 });
  const until = Date.now() + 2e3;
  let release;
  while (!release) {
    try {
      release = import_proper_lockfile.default.lockSync(file, { realpath: false, stale: 3e4, lockfilePath: file + ".lock" });
    } catch (e) {
      if (e.code !== "ELOCKED" || Date.now() >= until) throw e;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
    }
  }
  try {
    return work();
  } finally {
    release();
  }
}
function settings(root) {
  const cfg = {
    enabled: false,
    mode: "enforce",
    ...read(import_node_path.default.join(home(), "memory-loop/settings.json"), {}),
    ...read(import_node_path.default.join(root, ".codex/memory-loop.local.json"), {})
  };
  if (!MODES.includes(cfg.mode)) throw new Error("Invalid Memory Loop gate mode");
  return cfg;
}
function sessionFile(root, session) {
  if (typeof session !== "string" || !session) throw new Error("Hook session identity missing");
  return import_node_path.default.join(stateDir(root), "gate", import_node_crypto.default.createHash("sha256").update(session).digest("hex") + ".json");
}
var readyFile = (file) => file + ".ready";
function usable(file, state) {
  const ready = read(readyFile(file), {});
  return state && ready.turn === state.turn ? state.brief : void 0;
}
var environment = (root) => ({
  ...process.env,
  QMD_CONFIG_DIR: import_node_path.default.join(stateDir(root), "index"),
  INDEX_PATH: import_node_path.default.join(stateDir(root), "index/memory-loop.sqlite"),
  PATH: (process.env.PATH || "") + ":/opt/homebrew/bin:/usr/local/bin"
});
function index(root, bundle, configureOnly = false) {
  const result = (0, import_node_child_process.spawnSync)(
    "bash",
    [import_node_path.default.join(bundle, "runtime/sync-memories.sh"), ...configureOnly ? ["--configure-only"] : []],
    { cwd: root, env: { ...environment(root), MEMORY_LOOP_HOST: "codex", CLAUDE_PROJECT_DIR: root }, input: "", encoding: "utf8" }
  );
  if (result.error || result.status !== 0) throw result.error || new Error(result.stderr);
  if (!import_node_fs.default.existsSync(import_node_path.default.join(stateDir(root), "index/memory-loop.yml"))) throw new Error("Could not publish qmd configuration");
}
function health(text) {
  if (!/Total:\s*\d+ files indexed/.test(text)) throw new Error("Unrecognized qmd status; indexing health is unknown");
  const match = /Pending:\s*(\d+)\s+need embedding/.exec(text);
  if (text.includes("Pending:") && !match) throw new Error("Unrecognized Pending count");
  if (match && Number(match[1])) throw new Error(match[1] + " documents still need embedding");
}

// src/codex/brief.ts
var PREFIX = "memory-loop-ticket:";
function validate(value) {
  if (typeof value !== "string") throw new Error("brief must be a string");
  if ([...value].length > 4e3) throw new Error("brief exceeds 4,000 characters; shorten it explicitly (never truncated)");
  const brief = value.trim();
  if (/^(?:KB context:\s*)?none relevant\.?$/i.test(brief)) return brief;
  const lines = brief.split("\n").filter((line) => line.trim());
  if (lines.length < 1 || lines.length > 5 || !lines.every((line) => /^\s*(?:[-*]|\d+[.)])\s+\S.*$/.test(line)))
    throw new Error('brief must be 1\u20135 one-line bullets or "none relevant"');
  return brief;
}
function begin(root, payload) {
  const file = sessionFile(root, payload.session_id);
  const state = read(file, null);
  if (!state || state.turn !== payload.turn_id || payload.agent_id) throw new Error("prepare_brief requires the active root user turn");
  import_node_fs2.default.rmSync(readyFile(file), { force: true });
  delete state.brief;
  delete state.pending;
  write(file, state);
  const args = payload.tool_input || {};
  if (Object.keys(args).length !== 1 || !("brief" in args)) throw new Error("prepare_brief accepts only brief, never paths or session identifiers");
  const brief = validate(args.brief);
  const token = import_node_crypto2.default.randomBytes(32).toString("hex");
  write(
    import_node_path2.default.join(home(), "memory-loop/tickets", token + ".json"),
    { root, session: payload.session_id, turn: state.turn, brief, created: Date.now() }
  );
  state.pending = token;
  write(file, state);
  return { brief: PREFIX + token };
}
function prepare(transport) {
  if (typeof transport !== "string" || !/^memory-loop-ticket:[0-9a-f]{64}$/.test(transport))
    throw new Error("No hook-issued preparation ticket. Run setup and review Memory Loop hooks in /hooks.");
  const token = transport.slice(PREFIX.length);
  const ticketPath = import_node_path2.default.join(home(), "memory-loop/tickets", token + ".json");
  const ticket = read(ticketPath, null);
  if (!ticket || Date.now() - ticket.created > 3e5) throw new Error("Preparation ticket missing or expired; prepare again");
  const file = sessionFile(ticket.root, ticket.session);
  return locked(file, () => {
    try {
      const cfg = settings(ticket.root);
      if (!cfg.enabled || cfg.mode === "off") throw new Error("Memory Loop briefing is disabled");
      const state = read(file, null);
      if (!state || state.turn !== ticket.turn || state.pending !== token) throw new Error("Preparation superseded or user turn changed; prepare again");
      const brief = validate(ticket.brief);
      delete state.pending;
      state.brief = brief;
      write(file, state);
      write(readyFile(file), { turn: state.turn, token });
      return "Shared project context prepared for this user turn. Wait for this batch to finish before replacing it.";
    } finally {
      import_node_fs2.default.rmSync(ticketPath, { force: true });
    }
  });
}
var TOOL = {
  name: "prepare_brief",
  description: 'Prepare shared project context before root delegation this user turn. Search and read full memories first. Supply 1\u20135 one-line bullets or "none relevant", at most 4,000 characters. Wait for the previous batch before replacing. Requires trusted Memory Loop hooks.',
  inputSchema: { type: "object", properties: { brief: { type: "string", maxLength: 4e3 } }, required: ["brief"], additionalProperties: false }
};
function handle(request) {
  switch (request.method) {
    case "initialize":
      return { protocolVersion: request.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: "memory-brief", version: "0.1.0" } };
    case "ping":
      return {};
    case "tools/list":
      return { tools: [TOOL] };
    case "tools/call":
      try {
        if (request.params?.name !== TOOL.name || Object.keys(request.params.arguments || {}).join() !== "brief") throw new Error("Only prepare_brief(brief) is supported");
        return { content: [{ type: "text", text: prepare(request.params.arguments.brief) }] };
      } catch (e) {
        return { isError: true, content: [{ type: "text", text: "Preparation failed: " + e.message }] };
      }
    default:
      throw new Error("Method not found");
  }
}
async function serve() {
  for await (const line of import_node_readline.default.createInterface({ input: process.stdin })) {
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      console.log(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }));
      continue;
    }
    if (!("id" in request)) continue;
    let response;
    try {
      response = { result: handle(request) };
    } catch (e) {
      response = { error: { code: -32601, message: e.message } };
    }
    console.log(JSON.stringify({ jsonrpc: "2.0", id: request.id, ...response }));
  }
}

// src/codex/hooks.ts
var REMINDER = `This project keeps a knowledge base of past learnings, decisions, and
debugging discoveries in .claude/memories/, searchable with the Memory Loop query tool.
- If shared project context or a "KB context:" block is already supplied, verify it
  against the code, but do not search the KB again or re-derive it.
- Otherwise, before reading or grepping more than a couple of files, issue ONE
  query for your task: lex terms expected verbatim plus a vec question, an intent
  stating what you want and what to avoid, rerank:false and limit:6. Unlike the
  main thread, do not try keyword variations: no relevant results means move on.
- Snippets are leads, not evidence: get the full document before relying on it.
- Report anything the KB got wrong or left out.`;
var context = (event, text) => ({ hookSpecificOutput: { hookEventName: event, additionalContext: text } });
function log(root, p, mode, decision, extra = {}) {
  const file = import_node_path3.default.join(stateDir(root), "gate.log");
  locked(file, () => {
    if (import_node_fs3.default.existsSync(file) && import_node_fs3.default.statSync(file).size > 524288) atomic(file, import_node_fs3.default.readFileSync(file, "utf8").split("\n").slice(-1e3).join("\n") + "\n");
    import_node_fs3.default.appendFileSync(file, JSON.stringify({ ts: Date.now(), event: p.hook_event_name, session: p.session_id, mode, decision, ...extra }) + "\n", { mode: 384 });
  });
}
var isTool = (name, server, tool) => new RegExp("^mcp__[^ ]*" + server.replaceAll("-", "[-_]") + "__" + tool + "$").test(name);
function sweep(root) {
  for (const dir of [import_node_path3.default.join(stateDir(root), "gate"), import_node_path3.default.join(home(), "memory-loop/tickets")]) {
    if (!import_node_fs3.default.existsSync(dir)) continue;
    for (const name of import_node_fs3.default.readdirSync(dir)) {
      const file = import_node_path3.default.join(dir, name);
      if ((name.endsWith(".json") || name.endsWith(".ready")) && Date.now() - import_node_fs3.default.statSync(file).mtimeMs > 7 * 864e5) import_node_fs3.default.rmSync(file, { force: true });
    }
  }
}
function hook(p, bundle, indexing = false) {
  const event = p.hook_event_name;
  const root = project(p.cwd);
  const cfg = settings(root);
  if (!cfg.enabled) {
    if (!indexing && ["SessionStart", "UserPromptSubmit"].includes(event) && !cfg.opt_out)
      return context(event, "Memory Loop setup is missing. Run memory-loop-setup or scripts/memory-loop setup. Hooks never install dependencies.");
    return;
  }
  if (indexing) {
    index(root, bundle);
    return;
  }
  const mode = cfg.mode;
  const fingerprint = import_node_crypto3.default.createHash("sha256").update(import_node_fs3.default.readFileSync(import_node_path3.default.join(bundle, "hooks/hooks.json"))).digest("hex");
  const record = (decision, extra = {}) => log(root, p, mode, decision, { bundle, hook_hash: fingerprint, ...extra });
  if (["SessionStart", "PostCompact"].includes(event)) {
    record("instructions");
    return context(event, import_node_fs3.default.readFileSync(import_node_path3.default.join(bundle, "instructions/startup.md"), "utf8") + "\nGate mode: " + mode);
  }
  const reminder = () => context(event, import_node_fs3.default.readFileSync(import_node_path3.default.join(bundle, "instructions/reminder.md"), "utf8"));
  if (mode === "off") return event === "UserPromptSubmit" ? reminder() : void 0;
  const file = sessionFile(root, p.session_id);
  const tool = p.tool_name || "";
  return locked(file, () => {
    let state = read(file, null);
    if (event === "UserPromptSubmit" && !p.agent_id) {
      if (!p.turn_id) throw new Error("Hook turn identity missing");
      if (!state || state.turn !== p.turn_id) {
        import_node_fs3.default.rmSync(readyFile(file), { force: true });
        state = { turn: p.turn_id, queries: 0, denials: [] };
        write(file, state);
      }
      sweep(root);
      record("turn_start", { turn: p.turn_id });
      return reminder();
    }
    if (event === "SubagentStart") {
      const brief = usable(file, state);
      record(brief ? "briefed" : "reminded", { agent: p.agent_id });
      return context(event, brief ? "Shared project context (parent-curated; not task-specific):\n" + brief + "\nVerify against code; report stale or missing knowledge. Do not re-search supplied context." : REMINDER);
    }
    if (event === "PostToolUse" && isTool(tool, "memory-loop", "query")) {
      const args = p.tool_input || {};
      const query = typeof args.query === "string" ? args.query : Array.isArray(args.searches) ? args.searches.map((s) => s.query || "").join(" ") : "";
      let response = p.tool_response;
      if (typeof response === "string") {
        try {
          response = JSON.parse(response);
        } catch {
          response = {};
        }
      }
      if (!query.trim() || response?.isError) return;
      if (state && (p.agent_id || p.turn_id === state.turn)) {
        state.queries++;
        write(file, state);
        record("searched", { queries: state.queries });
      }
      return;
    }
    if (event !== "PreToolUse") return;
    if (isTool(tool, "memory-brief", "prepare_brief")) {
      try {
        const updatedInput = begin(root, p);
        record("preparing");
        return { hookSpecificOutput: { hookEventName: event, permissionDecision: "allow", updatedInput } };
      } catch (e) {
        return context(event, "Brief preparation failed: " + e.message);
      }
    }
    if (!["spawn_agent", "collaborationspawn_agent", "collaboration.spawn_agent", "Agent"].includes(tool)) return;
    if (p.agent_id) {
      record("nested_exempt");
      return;
    }
    if (!import_node_fs3.default.existsSync(import_node_path3.default.join(root, ".claude/memories"))) {
      record("no_collection");
      return;
    }
    if (!state || state.turn !== p.turn_id) throw new Error("No matching root turn; review UserPromptSubmit hook activation");
    if (!Number.isSafeInteger(state.queries) || state.queries < 0 || !Array.isArray(state.denials)) throw new Error("Unreadable gate counters");
    const queries = state.queries;
    if (queries > 0 && usable(file, state)) {
      record("allow", { queries });
      return;
    }
    const reason = 'Prerequisite missing: search the KB this user turn, retrieve full relevant memories, then call prepare_brief with 1\u20135 bullets or "none relevant". After it succeeds, retry this spawn. Wait for the previous batch before replacing the shared brief.';
    const same = state.denials.filter((q) => q === queries).length;
    let decision = mode;
    if (mode === "enforce") {
      if (state.denials.length >= 8 || same >= 4) decision = state.denials.length >= 8 ? "escape_turn" : "escape_no_progress";
      else {
        state.denials.push(queries);
        write(file, state);
        decision = "deny";
      }
    }
    record(decision, { queries, denials_turn: state.denials.length, denials_state: state.denials.filter((q) => q === queries).length });
    if (decision === "deny") return { hookSpecificOutput: { hookEventName: event, permissionDecision: "deny", permissionDecisionReason: reason } };
    if (mode === "warn") return context(event, reason);
  });
}

// src/codex/manage.ts
var import_node_fs5 = __toESM(require("node:fs"), 1);
var import_node_path5 = __toESM(require("node:path"), 1);
var import_node_os2 = __toESM(require("node:os"), 1);
var import_node_crypto4 = __toESM(require("node:crypto"), 1);
var import_node_child_process2 = require("node:child_process");
var import_node_util = require("node:util");
var import_promises = require("node:readline/promises");

// src/codex/configuration.ts
var import_node_fs4 = __toESM(require("node:fs"), 1);
var import_node_path4 = __toESM(require("node:path"), 1);

// node_modules/smol-toml/dist/date.js
var DATE_TIME_RE = /^(\d{4}-\d{2}-\d{2})?[T ]?(?:(\d{2}):\d{2}(?::\d{2}(?:\.\d+)?)?)?(Z|[-+]\d{2}:\d{2})?$/i;
var TomlDate = class _TomlDate extends Date {
  #hasDate = false;
  #hasTime = false;
  #offset = null;
  constructor(date) {
    let hasDate = true;
    let hasTime = true;
    let offset = "Z";
    if (typeof date === "string") {
      let match = date.match(DATE_TIME_RE);
      if (match) {
        if (!match[1]) {
          hasDate = false;
          date = `0000-01-01T${date}`;
        }
        hasTime = !!match[2];
        hasTime && date[10] === " " && (date = date.replace(" ", "T"));
        if (match[2] && +match[2] > 23) {
          date = "";
        } else {
          offset = match[3] || null;
          date = date.toUpperCase();
          if (!offset && hasTime)
            date += "Z";
        }
      } else {
        date = "";
      }
    }
    super(date);
    if (!isNaN(this.getTime())) {
      this.#hasDate = hasDate;
      this.#hasTime = hasTime;
      this.#offset = offset;
    }
  }
  isDateTime() {
    return this.#hasDate && this.#hasTime;
  }
  isLocal() {
    return !this.#hasDate || !this.#hasTime || !this.#offset;
  }
  isDate() {
    return this.#hasDate && !this.#hasTime;
  }
  isTime() {
    return this.#hasTime && !this.#hasDate;
  }
  isValid() {
    return this.#hasDate || this.#hasTime;
  }
  toISOString() {
    let iso = super.toISOString();
    if (this.isDate())
      return iso.slice(0, 10);
    if (this.isTime())
      return iso.slice(11, 23);
    if (this.#offset === null)
      return iso.slice(0, -1);
    if (this.#offset === "Z")
      return iso;
    let offset = +this.#offset.slice(1, 3) * 60 + +this.#offset.slice(4, 6);
    offset = this.#offset[0] === "-" ? offset : -offset;
    let offsetDate = new Date(this.getTime() - offset * 6e4);
    return offsetDate.toISOString().slice(0, -1) + this.#offset;
  }
  static wrapAsOffsetDateTime(jsDate, offset = "Z") {
    let date = new _TomlDate(jsDate);
    date.#offset = offset;
    return date;
  }
  static wrapAsLocalDateTime(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#offset = null;
    return date;
  }
  static wrapAsLocalDate(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#hasTime = false;
    date.#offset = null;
    return date;
  }
  static wrapAsLocalTime(jsDate) {
    let date = new _TomlDate(jsDate);
    date.#hasDate = false;
    date.#offset = null;
    return date;
  }
};

// node_modules/smol-toml/dist/error.js
function getLineColFromPtr(string, ptr) {
  let lines = string.slice(0, ptr).split(/\r\n|\n|\r/g);
  return [lines.length, lines.pop().length + 1];
}
function makeCodeBlock(string, line, column) {
  let lines = string.split(/\r\n|\n|\r/g);
  let codeblock = "";
  let numberLen = (Math.log10(line + 1) | 0) + 1;
  for (let i = line - 1; i <= line + 1; i++) {
    let l = lines[i - 1];
    if (!l)
      continue;
    codeblock += i.toString().padEnd(numberLen, " ");
    codeblock += ":  ";
    codeblock += l;
    codeblock += "\n";
    if (i === line) {
      codeblock += " ".repeat(numberLen + column + 2);
      codeblock += "^\n";
    }
  }
  return codeblock;
}
var TomlError = class extends Error {
  line;
  column;
  codeblock;
  constructor(message, options) {
    const [line, column] = getLineColFromPtr(options.toml, options.ptr);
    const codeblock = makeCodeBlock(options.toml, line, column);
    super(`Invalid TOML document: ${message}

${codeblock}`, options);
    this.line = line;
    this.column = column;
    this.codeblock = codeblock;
  }
};

// node_modules/smol-toml/dist/util.js
function indexOfNewline(str, start = 0) {
  let idx = str.indexOf("\n", start);
  if (str.charCodeAt(idx - 1) === 13)
    idx--;
  return idx;
}
function skipComment(ctx) {
  for (; ctx.p < ctx.s.length; ctx.p++) {
    let c = ctx.s.charCodeAt(ctx.p);
    if (c === 10)
      break;
    if (c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10) {
      ctx.p++;
      break;
    }
    if (c < 32 && c !== 9 || c === 127) {
      throw new TomlError("control characters are not allowed in comments", {
        toml: ctx.s,
        ptr: ctx.p
      });
    }
  }
}
function skipVoid(ctx, banNewLines, banComments) {
  let c;
  while (1) {
    while ((c = ctx.s.charCodeAt(ctx.p)) === 32 || c === 9 || !banNewLines && (c === 10 || c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10))
      ctx.p++;
    if (banComments || c !== 35)
      break;
    skipComment(ctx);
  }
}
function skipUntil(ctx, sep, end) {
  let ptr = ctx.p;
  if (!end) {
    ptr = indexOfNewline(ctx.s, ptr);
    ctx.p = ptr < 0 ? ctx.s.length : ptr;
    return;
  }
  for (; ctx.p < ctx.s.length; ctx.p++) {
    let c = ctx.s.charCodeAt(ctx.p);
    if (c === 35) {
      skipComment(ctx);
    } else if (c === end || c === sep) {
      return;
    }
  }
  throw new TomlError("cannot find end of structure", {
    toml: ctx.s,
    ptr
  });
}

// node_modules/smol-toml/dist/primitive.js
var INT_REGEX = /^((0x[0-9a-fA-F](_?[0-9a-fA-F])*)|(([+-]|0[ob])?\d(_?\d)*))$/;
var FLOAT_REGEX = /^[+-]?\d(_?\d)*(\.\d(_?\d)*)?([eE][+-]?\d(_?\d)*)?$/;
var LEADING_ZERO = /^[+-]?0[0-9_]/;
function parseString(ctx) {
  let start = ctx.p;
  let c = ctx.s.charCodeAt(ctx.p++);
  let first = c;
  let isLiteral = c === 39;
  let isMultiline = c === ctx.s.charCodeAt(ctx.p) && c === ctx.s.charCodeAt(ctx.p + 1);
  if (isMultiline) {
    if ((c = ctx.s.charCodeAt(ctx.p += 2)) === 10)
      ctx.p++;
    else if (c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10)
      ctx.p += 2;
  }
  let parsed = "";
  let sliceStart = ctx.p;
  let state = 0;
  for (; ctx.p < ctx.s.length; ctx.p++) {
    c = ctx.s.charCodeAt(ctx.p);
    if (isMultiline && (c === 10 || c === 13 && ctx.s.charCodeAt(ctx.p + 1) === 10)) {
      state = state && 3;
    } else if (c < 32 && c !== 9 || c === 127) {
      throw new TomlError("control characters are not allowed in strings", {
        toml: ctx.s,
        ptr: ctx.p
      });
    } else if ((!state || state === 3) && c === first && (!isMultiline || ctx.s.charCodeAt(ctx.p + 1) === first && ctx.s.charCodeAt(ctx.p + 2) === first)) {
      if (isMultiline) {
        if (ctx.s.charCodeAt(ctx.p + 3) === first)
          ctx.p++;
        if (ctx.s.charCodeAt(ctx.p + 3) === first)
          ctx.p++;
      }
      if (!state)
        parsed += ctx.s.slice(sliceStart, ctx.p);
      ctx.p += isMultiline ? 3 : 1;
      return parsed;
    } else if (!state) {
      if (!isLiteral && c === 92) {
        parsed += ctx.s.slice(sliceStart, sliceStart = ctx.p);
        state = 1;
      }
    } else if (state === 1) {
      if (c === 120 || c === 117 || c === 85) {
        let value = 0;
        let len = c === 120 ? 2 : c === 117 ? 4 : 8;
        for (let j = 0; j < len; j++, ctx.p++) {
          let hex = ctx.s.charCodeAt(ctx.p + 1);
          let digit = (
            /* 0-9 */
            hex >= 48 && hex <= 57 ? hex - 48 : (
              /* A-F */
              hex >= 65 && hex <= 70 ? hex - 65 + 10 : (
                /* a-f */
                hex >= 97 && hex <= 102 ? hex - 97 + 10 : -1
              )
            )
          );
          if (digit < 0)
            throw new TomlError("invalid non-hex character in unicode escape", { toml: ctx.s, ptr: ctx.p + 1 });
          value = value << 4 | digit;
        }
        if (value < 0 || value > 1114111 || value >= 55296 && value <= 57343) {
          throw new TomlError("invalid unicode escape", { toml: ctx.s, ptr: ctx.p });
        }
        parsed += String.fromCodePoint(value);
        sliceStart = ctx.p + 1;
        state = 0;
      } else if (c === 32 || c === 9) {
        state = 2;
      } else {
        if (c === 98)
          parsed += "\b";
        else if (c === 116)
          parsed += "	";
        else if (c === 110)
          parsed += "\n";
        else if (c === 102)
          parsed += "\f";
        else if (c === 114)
          parsed += "\r";
        else if (c === 101)
          parsed += "\x1B";
        else if (c === 34)
          parsed += '"';
        else if (c === 92)
          parsed += "\\";
        else
          throw new TomlError("unrecognized escape sequence", { toml: ctx.s, ptr: ctx.p });
        sliceStart = ctx.p + 1;
        state = 0;
      }
    } else if (c !== 32 && c !== 9) {
      if (state === 2) {
        throw new TomlError("invalid escape: only line-ending whitespace may be escaped", {
          toml: ctx.s,
          ptr: sliceStart
        });
      }
      state = !isLiteral && c === 92 ? 1 : 0;
      sliceStart = ctx.p;
    }
  }
  throw new TomlError("unfinished string", { toml: ctx.s, ptr: start });
}
function sliceAndTrimEndOf(ctx, start, end) {
  let value = ctx.s.slice(start, end);
  let commentIdx = value.indexOf("#");
  if (commentIdx > 0) {
    skipComment({ s: value, p: commentIdx, d: 0 });
    value = value.slice(0, commentIdx);
  }
  return value.trimEnd();
}
function parseValue(ctx, integersAsBigInt, end) {
  let ptr = ctx.p;
  let err = { toml: ctx.s, ptr };
  skipUntil(ctx, 44, end);
  let value = sliceAndTrimEndOf(ctx, ptr, ctx.p);
  if (!value)
    throw new TomlError("incomplete declaration: value expected", err);
  if (value === "-inf")
    return -Infinity;
  if (value === "inf" || value === "+inf")
    return Infinity;
  if (value === "nan" || value === "+nan" || value === "-nan")
    return NaN;
  if (value === "-0")
    return integersAsBigInt ? 0n : 0;
  let isInt = INT_REGEX.test(value);
  if (isInt || FLOAT_REGEX.test(value)) {
    if (LEADING_ZERO.test(value)) {
      throw new TomlError("leading zeroes are not allowed", err);
    }
    value = value.replace(/_/g, "");
    let numeric = +value;
    if (isNaN(numeric)) {
      throw new TomlError("invalid number", err);
    }
    if (isInt) {
      if ((isInt = !Number.isSafeInteger(numeric)) && !integersAsBigInt) {
        throw new TomlError("integer value cannot be represented losslessly", err);
      }
      if (isInt || integersAsBigInt === true)
        numeric = BigInt(value);
    }
    return numeric;
  }
  const date = new TomlDate(value);
  if (!date.isValid())
    throw new TomlError("invalid value", err);
  return date;
}

// node_modules/smol-toml/dist/extract.js
function extractValue(ctx, end, integersAsBigInt) {
  let ptr = ctx.p;
  let c = ctx.s.charCodeAt(ptr);
  if (c === 91 || c === 123) {
    if (!ctx.d--) {
      throw new TomlError("document contains excessively nested structures. aborting.", {
        toml: ctx.s,
        ptr
      });
    }
    let value = c === 91 ? parseArray(ctx, integersAsBigInt) : parseInlineTable(ctx, integersAsBigInt);
    ctx.d++;
    return value;
  }
  if (c === 34 || c === 39) {
    return parseString(ctx);
  }
  if (c === 116) {
    if (ctx.s.charCodeAt(++ctx.p) !== 114 || ctx.s.charCodeAt(++ctx.p) !== 117 || ctx.s.charCodeAt(++ctx.p) !== 101)
      throw new TomlError("invalid value", { toml: ctx.s, ptr });
    ctx.p++;
    return true;
  }
  if (c === 102) {
    if (ctx.s.charCodeAt(++ctx.p) !== 97 || ctx.s.charCodeAt(++ctx.p) !== 108 || ctx.s.charCodeAt(++ctx.p) !== 115 || ctx.s.charCodeAt(++ctx.p) !== 101)
      throw new TomlError("invalid value", { toml: ctx.s, ptr });
    ctx.p++;
    return false;
  }
  return parseValue(ctx, integersAsBigInt, end);
}

// node_modules/smol-toml/dist/struct.js
var KEY_PART_RE = /^[a-zA-Z0-9-_]+[ \t]*$/;
function parseKey(ctx, end = "=") {
  let start = ctx.p;
  let dot = start - 1;
  let parsed = [];
  let endPtr = ctx.s.indexOf(end, start);
  if (endPtr < 0) {
    throw new TomlError("incomplete key-value: cannot find end of key", {
      toml: ctx.s,
      ptr: start
    });
  }
  do {
    let c = ctx.s.charCodeAt(ctx.p = ++dot);
    if (c !== 32 && c !== 9) {
      if (c === 34 || c === 39) {
        if (c === ctx.s.charCodeAt(ctx.p + 1) && c === ctx.s.charCodeAt(ctx.p + 2)) {
          throw new TomlError("multiline strings are not allowed in keys", {
            toml: ctx.s,
            ptr: ctx.p
          });
        }
        let part = parseString(ctx);
        dot = ctx.s.indexOf(".", ctx.p);
        let strEnd = ctx.s.slice(ctx.p, dot < 0 || dot > endPtr ? endPtr : dot);
        let newLine = indexOfNewline(strEnd);
        if (newLine > -1) {
          throw new TomlError("newlines are not allowed in keys", {
            toml: ctx.s,
            ptr: newLine
          });
        }
        if (strEnd.trimStart()) {
          throw new TomlError("found extra tokens after the string part", {
            toml: ctx.s,
            ptr: ctx.p
          });
        }
        if (endPtr < ctx.p) {
          endPtr = ctx.s.indexOf(end, ctx.p);
          if (endPtr < 0) {
            throw new TomlError("incomplete key-value: cannot find end of key", {
              toml: ctx.s,
              ptr: start
            });
          }
        }
        parsed.push(part);
      } else {
        dot = ctx.s.indexOf(".", ctx.p);
        let part = ctx.s.slice(ctx.p, dot < 0 || dot > endPtr ? endPtr : dot);
        if (!KEY_PART_RE.test(part)) {
          throw new TomlError("only letter, numbers, dashes and underscores are allowed in keys", {
            toml: ctx.s,
            ptr: ctx.p
          });
        }
        parsed.push(part.trimEnd());
      }
    }
  } while (dot + 1 && dot < endPtr);
  ctx.p = endPtr + 1;
  skipVoid(ctx, true, true);
  return parsed;
}
function parseInlineTable(ctx, integersAsBigInt) {
  let res = {};
  let seen = /* @__PURE__ */ new Set();
  let c;
  ctx.p++;
  while (ctx.p < ctx.s.length) {
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p)) === 125) {
      ctx.p++;
      return res;
    }
    let k;
    let t = res;
    let hasOwn = false;
    let p = ctx.p;
    let key = parseKey(ctx);
    for (let i = 0; i < key.length; i++) {
      if (i)
        t = hasOwn ? t[k] : t[k] = {};
      k = key[i];
      if ((hasOwn = Object.hasOwn(t, k)) && (typeof t[k] !== "object" || seen.has(t[k]))) {
        throw new TomlError("trying to redefine an already defined value", {
          toml: ctx.s,
          ptr: p
        });
      }
      if (!hasOwn && k === "__proto__") {
        Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
      }
    }
    if (hasOwn) {
      throw new TomlError("trying to redefine an already defined value", {
        toml: ctx.s,
        ptr: ctx.p
      });
    }
    let value = extractValue(ctx, 125, integersAsBigInt);
    seen.add(t[k] = value);
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p++)) === 125) {
      return res;
    }
    if (c !== 44) {
      throw new TomlError("expected comma or end of structure", { toml: ctx.s, ptr: ctx.p - 1 });
    }
  }
  throw new TomlError("unfinished table encountered", {
    toml: ctx.s,
    ptr: ctx.p
  });
}
function parseArray(ctx, integersAsBigInt) {
  let res = [];
  let c;
  ctx.p++;
  while (ctx.p < ctx.s.length) {
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p)) === 93) {
      ctx.p++;
      return res;
    }
    res.push(extractValue(ctx, 93, integersAsBigInt));
    skipVoid(ctx);
    if ((c = ctx.s.charCodeAt(ctx.p++)) === 93) {
      return res;
    }
    if (c !== 44) {
      throw new TomlError("expected comma or end of structure", { toml: ctx.s, ptr: ctx.p - 1 });
    }
  }
  throw new TomlError("unfinished array encountered", {
    toml: ctx.s,
    ptr: ctx.p
  });
}

// node_modules/smol-toml/dist/parse.js
function peekTable(key, table, meta, type) {
  let t = table;
  let m = meta;
  let k;
  let hasOwn = false;
  let state;
  for (let i = 0; i < key.length; i++) {
    if (i) {
      t = hasOwn ? t[k] : t[k] = {};
      m = (state = m[k]).c;
      if (type === 0 && (state.t === 1 || state.t === 2)) {
        return null;
      }
      if (state.t === 2) {
        let l = t.length - 1;
        t = t[l];
        m = m[l].c;
      }
    }
    k = key[i];
    if ((hasOwn = Object.hasOwn(t, k)) && m[k]?.t === 0 && m[k]?.d) {
      return null;
    }
    if (!hasOwn) {
      if (k === "__proto__") {
        Object.defineProperty(t, k, { enumerable: true, configurable: true, writable: true });
        Object.defineProperty(m, k, { enumerable: true, configurable: true, writable: true });
      }
      m[k] = {
        t: i < key.length - 1 && type === 2 ? 3 : type,
        d: false,
        i: 0,
        c: {}
      };
    }
  }
  state = m[k];
  if (state.t !== type && !(type === 1 && state.t === 3)) {
    return null;
  }
  if (type === 2) {
    if (!state.d) {
      state.d = true;
      t[k] = [];
    }
    t[k].push(t = {});
    state.c[state.i++] = state = { t: 1, d: false, i: 0, c: {} };
  }
  if (state.d) {
    return null;
  }
  state.d = true;
  if (type === 1) {
    t = hasOwn ? t[k] : t[k] = {};
  } else if (type === 0 && hasOwn) {
    return null;
  }
  return [k, t, state.c];
}
function parse(toml, { maxDepth = 1e3, integersAsBigInt } = {}) {
  let ctx = { s: toml, p: 0, d: maxDepth };
  let res = {};
  let meta = {};
  let tmp;
  let tbl = res;
  let m = meta;
  skipVoid(ctx);
  while (ctx.p < toml.length) {
    if (toml.charCodeAt(ctx.p) === 91) {
      let isTableArray = toml.charCodeAt(++ctx.p) === 91;
      tmp = ctx.p += +isTableArray;
      let k = parseKey(ctx, "]");
      if (isTableArray) {
        if (toml.charCodeAt(ctx.p - 1) !== 93) {
          throw new TomlError("expected end of table declaration", {
            toml,
            ptr: ctx.p - 1
          });
        }
        ctx.p++;
      }
      let p = peekTable(
        k,
        res,
        meta,
        isTableArray ? 2 : 1
        /* Type.EXPLICIT */
      );
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr: tmp
        });
      }
      m = p[2];
      tbl = p[1];
    } else {
      tmp = ctx.p;
      let k = parseKey(ctx);
      let p = peekTable(
        k,
        tbl,
        m,
        0
        /* Type.DOTTED */
      );
      if (!p) {
        throw new TomlError("trying to redefine an already defined table or value", {
          toml,
          ptr: tmp
        });
      }
      p[1][p[0]] = extractValue(ctx, void 0, integersAsBigInt);
    }
    skipVoid(ctx, true);
    if (ctx.p < toml.length && (tmp = toml.charCodeAt(ctx.p)) !== 10 && tmp !== 13) {
      throw new TomlError("each key-value declaration must be followed by an end-of-line", {
        toml,
        ptr: ctx.p
      });
    }
    skipVoid(ctx);
  }
  return res;
}

// src/codex/configuration.ts
function lookup(data, keys) {
  for (const key of keys) {
    if (!data || typeof data !== "object" || !(key in data)) return { present: false };
    data = data[key];
  }
  return { present: true, value: data };
}
var equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function keyPath(text) {
  let data = parse(text + " = 0");
  const keys = [];
  while (data && typeof data === "object") {
    const key = Object.keys(data)[0];
    keys.push(key);
    data = data[key];
  }
  return keys;
}
function editToml(text, keys, value) {
  const old = lookup(parse(text), keys);
  const lines = text.match(/[^\n]*\n|[^\n]+$/g) || [];
  let table = [], found = -1, tableStart = -1, tableEnd = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const header = /^\s*\[([^\[\]\n]+)\]\s*(?:#.*)?\n?$/.exec(lines[i]);
    if (header) {
      if (equal(table, keys.slice(0, -1))) tableEnd = i;
      table = keyPath(header[1]);
      if (equal(table, keys.slice(0, -1))) {
        tableStart = i;
        tableEnd = lines.length;
      }
    } else if (lines[i].includes("=") && !lines[i].trimStart().startsWith("#")) {
      let full;
      try {
        full = [...table, ...keyPath(lines[i].split("=", 1)[0].trim())];
      } catch {
        continue;
      }
      if (equal(full, keys)) {
        if (old.present && !["string", "boolean"].includes(typeof old.value)) throw new Error("Cannot safely edit non-scalar config");
        found = i;
        break;
      }
    }
  }
  if (old.present && found < 0) throw new Error("Cannot safely edit inline config for " + keys.join(".") + "; expand it to a TOML table first");
  const assignment = value.present ? JSON.stringify(found >= 0 ? lines[found].split("=", 1)[0].trim().replace(/^"|"$/g, "") : keys.at(-1)) + " = " + JSON.stringify(value.value) + "\n" : "";
  if (found >= 0) lines[found] = value.present ? lines[found].split("=", 1)[0].trim() + " = " + JSON.stringify(value.value) + "\n" : "";
  else if (value.present) {
    if (tableStart >= 0) lines.splice(tableEnd, 0, assignment);
    else lines.push("\n[" + keys.slice(0, -1).map((k) => JSON.stringify(k)).join(".") + "]\n" + assignment);
  }
  const result = lines.join("");
  if (!equal(lookup(parse(result), keys), value)) throw new Error("Config edit did not produce requested value");
  return result;
}
var Ownership = class _Ownership {
  constructor(file) {
    this.file = file;
    this.records = read(file, []);
  }
  records;
  set(file, keys, value, kind = "toml") {
    file = import_node_path4.default.resolve(file);
    const text = import_node_fs4.default.existsSync(file) ? import_node_fs4.default.readFileSync(file, "utf8") : "";
    const old = lookup(kind === "toml" ? parse(text) : JSON.parse(text || "{}"), keys);
    const desired = { present: true, value };
    if (equal(old, desired)) return;
    const result = _Ownership.render(text, keys, desired, kind);
    let record = this.records.find((r) => r.path === file && equal(r.keys, keys));
    if (!record) {
      record = { path: file, keys, kind, before: old, owned: desired };
      this.records.push(record);
    } else if (!equal(old, record.owned)) record.before = old;
    record.owned = desired;
    write(this.file, this.records);
    atomic(file, result);
  }
  static render(text, keys, value, kind) {
    if (kind === "toml") return editToml(text, keys, value);
    const data = JSON.parse(text || "{}");
    let target = data;
    for (const key of keys.slice(0, -1)) target = target[key] ||= {};
    if (value.present) target[keys.at(-1)] = value.value;
    else delete target[keys.at(-1)];
    return JSON.stringify(data, null, 2) + "\n";
  }
  restore(file, keys) {
    const record = this.records.find((r) => r.path === import_node_path4.default.resolve(file) && equal(r.keys, keys));
    if (!record) return;
    if (import_node_fs4.default.existsSync(record.path)) {
      const text = import_node_fs4.default.readFileSync(record.path, "utf8");
      const data = record.kind === "toml" ? parse(text) : JSON.parse(text);
      if (equal(lookup(data, keys), record.owned)) atomic(record.path, _Ownership.render(text, keys, record.before, record.kind));
      else console.log("Preserved user change: " + record.path + " " + keys.join("."));
    }
    this.records = this.records.filter((r) => r !== record);
    write(this.file, this.records);
  }
  cleanup() {
    const retained = [];
    for (const r of [...this.records].reverse()) {
      if (!import_node_fs4.default.existsSync(r.path)) continue;
      const text = import_node_fs4.default.readFileSync(r.path, "utf8");
      try {
        const data = r.kind === "toml" ? parse(text) : JSON.parse(text);
        if (equal(lookup(data, r.keys), r.owned)) atomic(r.path, _Ownership.render(text, r.keys, r.before, r.kind));
        else console.log("Preserved user change: " + r.path + " " + r.keys.join("."));
      } catch (e) {
        console.error("Could not restore " + r.path + ": " + e.message);
        retained.push(r);
      }
    }
    this.records = retained.reverse();
    write(this.file, this.records);
    if (retained.length) throw new Error("Some settings could not be restored; ownership records retained");
  }
};

// src/codex/manage.ts
var PLUGIN = "memory-loop@memory-loop";
var IGNORE = "\n# Memory Loop Codex (setup-owned)\n/.codex/.memory-loop/\n/.codex/memory-loop.local.json\n/.codex/config.toml\n# End Memory Loop Codex\n";
var run = (cmd, args, opts = {}) => (0, import_node_child_process2.spawnSync)(cmd, args, { encoding: "utf8", timeout: 6e4, ...opts });
var exists = (cmd) => run("/bin/sh", ["-c", 'command -v "$1"', "--", cmd]).status === 0;
var modelFile = () => import_node_path5.default.join(process.env.XDG_CACHE_HOME || import_node_path5.default.join(import_node_os2.default.homedir(), ".cache"), "qmd/models/hf_Qwen_Qwen3-Embedding-0.6B-Q8_0.gguf");
function dependencies() {
  const errors = ["node", "npm", "jq", "qmd", "codex"].filter((name) => !exists(name)).map((name) => name + " is missing");
  if (Number(process.versions.node.split(".")[0]) < 22) errors.push("Node >=22 is required");
  if (exists("qmd") && !/^qmd 2\.8\.3(?: |$)/.test(run("qmd", ["--version"]).stdout.trim())) errors.push("qmd must be exactly 2.8.3");
  return errors;
}
function execute(cmd, args, env = process.env) {
  const r = (0, import_node_child_process2.spawnSync)(cmd, args, { stdio: "inherit", env });
  if (r.error || r.status !== 0) throw r.error || new Error(cmd + " failed");
}
function installDependencies() {
  if (!exists("jq")) execute("brew", ["install", "jq"]);
  if (!exists("qmd") || !/^qmd 2\.8\.3(?: |$)/.test(run("qmd", ["--version"]).stdout.trim())) execute("npm", ["install", "-g", "@tobilu/qmd@2.8.3"]);
  if (!import_node_fs5.default.existsSync(modelFile())) {
    const tmp = import_node_fs5.default.mkdtempSync(import_node_path5.default.join(import_node_os2.default.tmpdir(), "memory-loop-model-"));
    try {
      execute("qmd", ["--index", "pull", "pull", "--progress"], { ...process.env, QMD_CONFIG_DIR: tmp, INDEX_PATH: import_node_path5.default.join(tmp, "pull.sqlite"), QMD_EMBED_MODEL: MODEL, QMD_GENERATE_MODEL: MODEL, QMD_RERANK_MODEL: MODEL });
    } finally {
      import_node_fs5.default.rmSync(tmp, { recursive: true, force: true });
    }
  }
}
async function ask(text) {
  if (!process.stdin.isTTY) throw new Error(text + " Supply an explicit yes/no option for noninteractive setup.");
  const rl = (0, import_promises.createInterface)({ input: process.stdin, output: process.stdout });
  try {
    return /^(y|yes)$/i.test((await rl.question(text + " [y/N] ")).trim()) ? "yes" : "no";
  } finally {
    rl.close();
  }
}
var ledger = (root, scope) => new Ownership(scope === "global" ? import_node_path5.default.join(home(), "memory-loop/ownership-global.json") : import_node_path5.default.join(stateDir(root), "ownership.json"));
var configPath = (root, scope) => scope === "global" ? import_node_path5.default.join(home(), "config.toml") : import_node_path5.default.join(root, ".codex/config.toml");
var settingsPath = (root, scope) => scope === "global" ? import_node_path5.default.join(home(), "memory-loop/settings.json") : import_node_path5.default.join(root, ".codex/memory-loop.local.json");
function ignore(root) {
  const r = run("git", ["-C", root, "rev-parse", "--git-path", "info/exclude"]);
  if (r.status) return;
  const file = import_node_path5.default.resolve(root, r.stdout.trim());
  const text = import_node_fs5.default.existsSync(file) ? import_node_fs5.default.readFileSync(file, "utf8") : "";
  if (!text.includes(IGNORE)) {
    atomic(file, text + IGNORE);
    write(import_node_path5.default.join(stateDir(root), "ignore-ownership.json"), { path: file, block: IGNORE });
  }
}
function unignore(root) {
  const file = import_node_path5.default.join(stateDir(root), "ignore-ownership.json");
  const record = read(file, null);
  if (record && import_node_fs5.default.existsSync(record.path)) atomic(record.path, import_node_fs5.default.readFileSync(record.path, "utf8").replace(record.block, ""));
  import_node_fs5.default.rmSync(file, { force: true });
}
function configure(root, opts, setup = false, choices = {}) {
  const own = ledger(root, opts.scope), dest = settingsPath(root, opts.scope), plugin = opts["plugin-id"];
  if (setup) {
    own.set(dest, ["enabled"], true, "json");
    own.set(dest, ["opt_out"], false, "json");
    own.set(dest, ["plugin_id"], plugin, "json");
    own.set(configPath(root, opts.scope), ["plugins", plugin, "enabled"], true);
    if (opts.scope === "project") own.set(import_node_path5.default.join(home(), "config.toml"), ["plugins", plugin, "enabled"], false);
    own.set(configPath(root, opts.scope), ["features", "hooks"], true);
    own.set(configPath(root, opts.scope), ["features", "plugins"], true);
    ignore(root);
  }
  if (opts.mode) own.set(dest, ["mode"], opts.mode, "json");
  else if (setup && !("mode" in read(dest, {}))) own.set(dest, ["mode"], settings(root).mode, "json");
  if (opts.enabled) {
    own.set(dest, ["enabled"], opts.enabled === "yes", "json");
    own.set(dest, ["opt_out"], opts.enabled !== "yes", "json");
    own.set(configPath(root, opts.scope), ["plugins", plugin, "enabled"], opts.enabled === "yes");
  }
  if (opts.scope === "project") ignore(root);
  if (setup) {
    const file = configPath(root, opts.scope);
    const memoryKey = ["features", "memories"];
    const approvalKey = ["plugins", plugin, "mcp_servers", "memory-brief", "tools", "prepare_brief", "approval_mode"];
    if (choices["disable-builtin-memory"] === "yes") own.set(file, memoryKey, false);
    else if (choices["disable-builtin-memory"] === "no") own.restore(file, memoryKey);
    if (choices["auto-prepare"] === "yes") own.set(file, approvalKey, "approve");
    else if (choices["auto-prepare"] === "no") own.restore(file, approvalKey);
    console.log("Setup saved. In a new Codex session, open /hooks and review/trust Memory Loop hooks. Installation does not grant hook trust. Changed hooks require review again.");
  }
  console.log(JSON.stringify(settings(root), null, 2));
}
function doctor(root, plugin, bundle) {
  let failures = 0;
  const check = (label, ok, detail = "") => {
    console.log((ok ? "OK   " : "FAIL ") + label + (detail ? ": " + detail : ""));
    if (!ok) failures++;
  };
  for (const error of dependencies()) check("Dependencies", false, error);
  check("Shared Qwen3 model downloaded", import_node_fs5.default.existsSync(modelFile()));
  const cfg = settings(root);
  check("Setup enabled for project", cfg.enabled);
  const binding = read(import_node_path5.default.join(home(), "memory-loop/runtime.json"), {});
  const hooks = binding.bundle && import_node_path5.default.join(binding.bundle, "hooks/hooks.json");
  check("Installed runtime binding", binding.bundle === bundle && import_node_fs5.default.existsSync(import_node_path5.default.join(bundle, "runtime/codex.cjs")), "Rerun setup after cache-path changes");
  const fingerprint = hooks && import_node_fs5.default.existsSync(hooks) ? import_node_crypto4.default.createHash("sha256").update(import_node_fs5.default.readFileSync(hooks)).digest("hex") : void 0;
  if (exists("codex")) {
    const r = run("codex", ["plugin", "list", "--json"], { cwd: root });
    let enabled = false;
    try {
      enabled = JSON.parse(r.stdout).installed.some((p) => p.pluginId === plugin && p.enabled);
    } catch {
    }
    check("Plugin installed and enabled", r.status === 0 && enabled, "Review /plugins if missing");
  }
  const dir = import_node_path5.default.join(stateDir(root), "index"), conf = import_node_path5.default.join(dir, "memory-loop.yml"), log2 = import_node_path5.default.join(dir, "memory-loop.log");
  check("Model configuration", import_node_fs5.default.existsSync(conf) && import_node_fs5.default.readFileSync(conf, "utf8").split(MODEL).length === 4);
  check("Indexing diagnostics", !import_node_fs5.default.existsSync(log2), import_node_fs5.default.existsSync(log2) ? import_node_fs5.default.readFileSync(log2, "utf8").slice(-1500) : "");
  if (import_node_fs5.default.existsSync(conf) && exists("qmd")) {
    try {
      const r = run("qmd", ["--index", "memory-loop", "status"], { env: environment(root) });
      if (r.status) throw new Error(r.stderr || "qmd status failed");
      health(r.stdout);
      check("Index status and model", r.stdout.includes("Qwen3-Embedding-0.6B"));
      const count = Number(/Total:\s*(\d+)/.exec(r.stdout)[1]);
      if (count) {
        check("Indexed collection exists", import_node_fs5.default.existsSync(import_node_path5.default.join(root, ".claude/memories")));
        const q = run("qmd", ["--index", "memory-loop", "query", "vec: past decisions and learnings", "-n", "1", "--format", "json"], { env: environment(root) });
        const hits = JSON.parse(q.stdout);
        if (q.status || !hits.length) throw new Error("Search returned no results");
        const get = run("qmd", ["--index", "memory-loop", "get", hits[0].docid], { env: environment(root) });
        check("Semantic retrieval and full document", get.status === 0 && !!get.stdout.trim());
      } else check("Empty collection", true, "0 documents; retrieval not exercised");
    } catch (e) {
      check("Retrieval", false, e.message);
    }
  }
  const events = import_node_path5.default.join(stateDir(root), "gate.log");
  const recent = import_node_fs5.default.existsSync(events) ? import_node_fs5.default.readFileSync(events, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((e) => Date.now() - e.ts < 864e5 && e.bundle === binding.bundle && e.hook_hash === fingerprint) : [];
  check("Observed trusted startup hook (last 24h)", recent.some((e) => e.event === "SessionStart"), "Start a new session after /hooks review");
  if (cfg.mode !== "off") check("Observed turn hook (last 24h)", recent.some((e) => e.decision === "turn_start"));
  console.log("Gate evaluations / child deliveries observed: " + recent.filter((e) => ["PreToolUse", "SubagentStart"].includes(e.event)).length);
  return failures ? 1 : 0;
}
async function manage(argv, bundle) {
  const { values: opts, positionals } = (0, import_node_util.parseArgs)({ args: argv, allowPositionals: true, options: {
    project: { type: "string", default: process.cwd() },
    scope: { type: "string", default: "global" },
    "plugin-id": { type: "string", default: PLUGIN },
    mode: { type: "string" },
    enabled: { type: "string" },
    "install-deps": { type: "boolean" },
    "disable-builtin-memory": { type: "string" },
    "auto-prepare": { type: "string" },
    "purge-state": { type: "boolean" },
    help: { type: "boolean" }
  } });
  if (opts.help || !positionals.length) {
    console.log("memory-loop setup|configure|doctor|cleanup [--scope global|project] [--project PATH]\nsetup: --install-deps --disable-builtin-memory yes|no --auto-prepare yes|no\nconfigure: --mode enforce|warn|observe|off --enabled yes|no\ncleanup: --purge-state (explicitly removes this project\u2019s Codex index/logs)\nPlugin identity defaults to memory-loop@memory-loop; override with --plugin-id.");
    return 0;
  }
  if (positionals.length !== 1 || !["setup", "configure", "doctor", "cleanup"].includes(positionals[0])) throw new Error("Unknown command");
  if (!["global", "project"].includes(opts.scope)) throw new Error("scope must be global or project");
  if (opts.mode && !MODES.includes(opts.mode)) throw new Error("Invalid gate mode");
  for (const key of ["enabled", "disable-builtin-memory", "auto-prepare"]) if (opts[key] && !["yes", "no"].includes(opts[key])) throw new Error(key + " must be yes or no");
  const root = project(opts.project), action = positionals[0];
  if (action === "doctor") return doctor(root, opts["plugin-id"], bundle);
  let choices = {};
  if (action === "setup") {
    if (opts["install-deps"]) installDependencies();
    const missing = dependencies();
    if (!import_node_fs5.default.existsSync(modelFile())) missing.push("Shared Qwen3 model missing");
    if (missing.length) throw new Error(missing.join("; ") + ". Run setup --install-deps to install dependencies/model explicitly.");
    choices = read(import_node_path5.default.join(home(), "memory-loop/choices.json"), {});
    for (const [field, prompt] of [["disable-builtin-memory", "Disable Codex built-in memory?"], ["auto-prepare", "Allow automatic prepare_brief calls without per-call approval?"]])
      choices[field] = opts[field] ?? choices[field] ?? await ask(prompt);
  }
  locked(import_node_path5.default.join(home(), "memory-loop/admin"), () => {
    if (action === "setup") {
      write(import_node_path5.default.join(home(), "memory-loop/choices.json"), choices);
      ledger(root, opts.scope).set(import_node_path5.default.join(home(), "memory-loop/runtime.json"), ["bundle"], bundle, "json");
      configure(root, opts, true, choices);
    } else if (action === "configure") configure(root, opts);
    else {
      ledger(root, opts.scope).cleanup();
      console.log("Owned settings restored where unchanged. Use codex plugin remove " + opts["plugin-id"] + " to uninstall the bundle.");
      if (opts["purge-state"]) {
        unignore(root);
        import_node_fs5.default.rmSync(stateDir(root), { recursive: true, force: true });
      }
      console.log("Memories, dependencies, and shared model preserved. Indexes/logs remain unless --purge-state was supplied.");
    }
  });
  if (action === "setup") {
    index(root, bundle, true);
    index(root, bundle);
  }
  return 0;
}

// src/codex/main.ts
async function main() {
  const bundle = import_node_path6.default.resolve(__dirname, "..");
  const action = process.argv[2];
  if (action === "hook") {
    let payload;
    try {
      payload = JSON.parse(import_node_fs6.default.readFileSync(0, "utf8"));
      const root = project(payload.cwd);
      if (payload.hook_event_name === "SessionStart" && settings(root).enabled) ignore(root);
      const result = hook(payload, bundle, process.argv.includes("--index"));
      if (result) console.log(JSON.stringify(result));
    } catch (e) {
      console.error("Memory Loop hook failed open: " + e.message);
      if (payload?.hook_event_name === "SubagentStart") {
        try {
          const cfg = settings(project(payload.cwd));
          if (cfg.enabled && cfg.mode !== "off") console.log(JSON.stringify(context("SubagentStart", REMINDER)));
        } catch {
        }
      }
    }
  } else if (action === "brief-mcp") await serve();
  else if (action === "qmd-mcp") {
    const root = project();
    if (!settings(root).enabled) throw new Error("Memory Loop setup missing or project disabled. Run memory-loop setup.");
    const missing = dependencies();
    if (!import_node_fs6.default.existsSync(modelFile())) missing.push("Shared Qwen3 model missing");
    if (missing.length) throw new Error(missing.join("; ") + ". Run Memory Loop setup.");
    index(root, bundle, true);
    const child = (0, import_node_child_process3.spawn)("qmd", ["--index", "memory-loop", "mcp"], { stdio: "inherit", env: environment(root) });
    for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
    child.on("error", (e) => {
      console.error(e.message);
      process.exitCode = 1;
    });
    child.on("exit", (code) => {
      process.exitCode = code ?? 1;
    });
  } else process.exitCode = await manage(process.argv.slice(2), bundle);
}
main().catch((e) => {
  console.error("Memory Loop: " + e.message);
  process.exitCode = 1;
});
/*! Bundled license information:

smol-toml/dist/date.js:
smol-toml/dist/error.js:
smol-toml/dist/util.js:
smol-toml/dist/primitive.js:
smol-toml/dist/extract.js:
smol-toml/dist/struct.js:
smol-toml/dist/parse.js:
smol-toml/dist/stringify.js:
smol-toml/dist/index.js:
  (*!
   * Copyright (c) Squirrel Chat et al., All rights reserved.
   * SPDX-License-Identifier: BSD-3-Clause
   *
   * Redistribution and use in source and binary forms, with or without
   * modification, are permitted provided that the following conditions are met:
   *
   * 1. Redistributions of source code must retain the above copyright notice, this
   *    list of conditions and the following disclaimer.
   * 2. Redistributions in binary form must reproduce the above copyright notice,
   *    this list of conditions and the following disclaimer in the
   *    documentation and/or other materials provided with the distribution.
   * 3. Neither the name of the copyright holder nor the names of its contributors
   *    may be used to endorse or promote products derived from this software without
   *    specific prior written permission.
   *
   * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
   * ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
   * WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
   * DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
   * FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
   * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
   * SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
   * CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY,
   * OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
   * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
   *)
*/
