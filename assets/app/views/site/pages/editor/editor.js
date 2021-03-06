var fs = require('fs');

var Backbone = require('backbone');
var _ = require('underscore');
var yaml = require('yamljs');

var CodeMirror = require('codemirror');
require('codemirror/mode/yaml/yaml');

var createProseMirror = require('./prosemirror/create');

var decodeB64 = require('../../../../helpers/encoding').decodeB64;

var Document = require('../../../../models/Document');

var templateHtml = fs.readFileSync(__dirname + '/../../../../templates/site/pages/editor/file.html').toString();
var whitelistFieldHtml = fs.readFileSync(__dirname + '/../../../../templates/site/pages/editor/whitelist-field.html').toString();

var EditorView = Backbone.View.extend({
  tagName: 'div',
  events: {
    'click [data-action=save-content]': 'saveDocument',
    'click [data-action=delete-draft]': 'deleteDraft',
    'click [data-action=publish-content]': 'publishContent'
  },
  template: _.template(templateHtml),
  initialize: function (opts) {
    var self = this;
    var documentOptions = {};

    this.editors = {};
    this.path = opts.path;
    this.settingsFields = this.extendSettingFields(opts.settingsFields, this.model.getLayouts());
    this.isNewPage = opts.isNewPage;

    if (!opts.isNewPage) {
      documentOptions = _.extend({}, documentOptions, {
        fileName: this.model.get('file'),
        content: this.cleanContent(decodeB64(this.model.get('json').content))
      });
    }

    this.doc = new Document(documentOptions);

    // On builds, toggle preview button
    federalist.sites.on('sync', this.previewButton.bind(this));
    this.previewButton(federalist.sites);


    this.$el.html(this.template(Object.assign({}, this.doc.toJSON(), {
      settingsDisplayStyle: this.getSettingsDisplayStyle(this.doc),
      draft: false
    })));
    this.initializeSettingsEditor();
    this.initializeContentEditor();
    this.initializeSockets(this.model.get('file'));

    return this;
  },
  initializeSockets: function (file) {
    var self = this;

    if (!file) {
      return;
    }

    io.socket.get('/v0/site/lock', { file: file }, function(data) {
      // Store the socket ID for future reference
      self.socket = data.id;

      // Apply the lock
      self.lockContent.call(self, data);

      // On any change events (others open or leave the page), reapply the lock
      io.socket.on('change', self.lockContent.bind(self));

      // If the user navigates away from the page, remove the lock
      // The server will do this automatically if the socket session breaks
      federalist.once('route', function() {
        $('.alert-container').html('');
        io.socket.get('/v0/site/unlock', { file: file });
      });
    });
  },
  previewButton: function (sites) {
    var build = _.chain(federalist.github
      .get('site')
      .get('builds'))
      .sortBy('id')
      .reverse()
      .findWhere({ branch: this.model.get('branch') })
      .value();
    var processing = (!build || !build.completedAt);

    $('.preview-buttons').toggleClass('processing', processing);
  },

  initializeSettingsEditor: function () {
    var settings, settingsEditorEl;

    settingsEditorEl = this.$('[data-target=settings]')[0];
    this.editors.settings = CodeMirror(settingsEditorEl, {
      lineNumbers: true,
      mode: "yaml",
      tabSize: 2,
      extraKeys: {
        Tab: false
      }
    });

    if (this.doc.get('frontMatter') || this.doc.get('frontMatter') === '') {
      this.settings = this.parseSettings(this.doc);
      this.editors.settings.doc.setValue(this.settings.remaining);
    }
  },
  extendSettingFields: function (fields, layouts) {
    var f = _.extend({
      title: {
        type: 'text'
      },
      layout: {
        type: 'select',
        options: layouts
      },
      author: {
        type: 'text'
      },
      date: {
        type: 'date'
      }
    }, fields || {});

    return f;
  },
  parseSettings: function (doc) {
    var self = this,
        y = yaml.parse(doc.get('frontMatter')) || {},
        whitelist;

    whitelist = Object.keys(y).filter(function(k) {
      return self.settingsFields[k];
    }).map(function(k) {
      var r = {
        name: k,
        label: k,
        type: self.settingsFields[k].type,
        value: y[k]
      };
      if (r.type === 'select') {
        r.options = self.settingsFields[k].options;
        if (!_(r.options).contains(r.value)) r.options.push(r.value);
      }
      delete y[k];
      return r;
    });

    return {
      whitelist: whitelist,
      remaining: yaml.dump(y)
    };
  },
  initializeContentEditor: function () {
    var contentEditorEl = this.$('[data-target=content]')[0];
    var documentContent = this.doc.get('content') || '';
    var fileExt = this.doc.get('fileExt');

    try {
      // try to load content into prosemirror
      this.editors.content = this.editors.content || createProseMirror(contentEditorEl);
      this.editors.content.setContent(documentContent, 'markdown');
    }
    catch (e) {
      // if prosemirror errors out, use codemirror
      $(contentEditorEl).empty(); // remove prosemirror
      this.editors.content = CodeMirror(contentEditorEl, {
        lineNumbers: true,
        lineWrapping: true,
        extraKeys: {
          Tab: false
        }
      });
      this.editors.content.doc.setValue(documentContent);
    }

    if (fileExt !== 'md' && fileExt !== 'markdown') {
      $(contentEditorEl).parents('.usa-grid').first().hide();
    }
  },
  fileUrl: function (file, model) {
    model = model || this.model;
    return ['#site', model.site.id, 'edit', model.get('branch'), file].join('/');
  },
  lockContent: function(data) {
    var first = (data.subscribers && data.subscribers[0]) ||
                      (this.socket.subscribers && this.socket.subscribers[0]);

    if (first !== this.socket) {
      var message = 'Another user is editing this file. Once they finish, this page will unlock and you will be able to edit it.';

      // This is so we can tell if a user is unlocked for the first time
      this.locked = true;

      // Add error message
      this.setAlert(message);

      // Disable / style form elements
      $('.CodeMirror, .ProseMirror').append('<div class="mask"></div>');
      $('.save-panel, .ProseMirror-menubar').remove();

    } else {

      // If unlocking for the first time, refresh the view
      if (this.locked) {
        this.locked = false;
        Backbone.history.loadUrl();
      }

    }
  },
  render: function () {
    var self = this,
        settingsDisplayStyle = this.getSettingsDisplayStyle(this.doc);

    if (settingsDisplayStyle === 'whitelist') this.renderWhitelistSettings();

    window.setTimeout(function() {
      self.editors.settings.refresh();
      if (self.editors.content && self.editors.content.refresh) {
        self.editors.content.refresh();
      }
    }, 0);

    return this;
  },
  renderWhitelistSettings: function () {
    var self = this,
        html = _.template(whitelistFieldHtml),
        target = this.$('#whitelist');

    target.empty();
    this.settings.whitelist.forEach(function(w) {
      if (w.type === 'date') w.value = self.toIsoDateString(w.value);
      var el = html(w);
      target.append(el);
    });
  },
  setAlert: function (message) {
    $('.alert-container').html(
      '<div class="usa-grid"><div class="usa-alert usa-alert-info" role="alert">' +
        message +
      '</div></div>'
    );
  },
  /**
   * Replace {{ site.baseurl }} with Github URL so assets load
   *
   * @param {string} content
   * @return {string} content - with replaced baseUrls
   */
  cleanContent: function (content, model) {
    model = model || this.model;
    var baseUrl = ["https://raw.githubusercontent.com",
                    model.owner,
                    model.name,
                    model.branch
                  ].join('/');

    content = content.replace(/{{ site.baseurl }}/g, baseUrl);
    return content;
  },
  saveSuccess: function (err, e) {
    if (err) return this.saveFailure(err);
    document.body.scrollTop = 0;

    var url = this.fileUrl(this.model.file);

    federalist.navigate(url, { trigger: true });
    this.setAlert('Your draft was saved.');
  },
  saveFailure: function (e) {
    var messages = {
          0:   'The internet is not connected. Please check your connection.',
          404: 'Whoops, looks like this page can not be found.',
          409: 'Uh oh, there was a conflict when saving',
          422: 'Github is missing something'
        },
        status = messages[e.response] || 'That hasn\'t happened before';

    document.body.scrollTop = 0;
    this.setAlert(status);
  },
  deleteDraft: function(e) {
    e.preventDefault();
    this.model.deleteBranch(function(err) {
      if (err) return this.saveFailure(err);
      var url = this.fileUrl(this.model.file);
      federalist.navigate(url, { trigger: true });
      this.setAlert('Your draft was deleted.');
    }.bind(this));
  },
  publishContent: function(e) {
    e.preventDefault();
    this.saveDocument(e, 'publish', function(err) {
      if (err) return this.saveFailure(err);
      var url = this.fileUrl(this.model.file);
      federalist.navigate(url, { trigger: true });
      this.setAlert('Your draft is being published.');
    }.bind(this));
  },
  showSavingStatusResult: function () {
    this.$('#save-status-result').show();
    this.$('#save-status-result').removeClass('label-success');
    this.$('#save-status-result').removeClass('label-danger');
    this.$('#save-status-result').text('Saving...');
  },
  saveDocument: function (e, method, done) {
    var self = this,
        settings = this.getSettingsFromEditor(),
        content = this.getContentFromEditor(),
        pageTitle;

    e.preventDefault();

    method = method || 'save';
    done = done || this.saveSuccess;

    this.showSavingStatusResult();
    this.doc.set('frontMatter', false);

    if (settings) this.doc.set('frontMatter', settings);
    if (content) this.doc.set('content', content);

    if (this.isNewPage) {
      this.saveNewDocument(method, done);
    } else {
      this.model[method]({
        content: this.doc.toMarkdown(),
        message: this.$('#save-content-message').val()
      }, done.bind(this));
    }

    return this;
  },
  saveNewDocument: function (method, done) {
    var self = this;
    var fileName = this.doc.get('fileName');

    this.model.set('file', fileName);

    this.model[method]({
      path: ['pages', fileName].join('/'),
      content: this.doc.toMarkdown(),
      message: 'Created ' + ['pages', fileName].join('/')
    }, done.bind(this));
  },
  getSettingsFromEditor: function () {
    var self = this,
        remaining = this.editors.settings.doc.getValue(),
        whitelist = this.settings.whitelist.map(function (v) {
          var sel = '[name=' + v.name + ']', value;
          if (v.type === 'boolean') {
            sel += ':checked';
          }

          value = self.$(sel).val();
          return [v.name, value].join(': ');
        }).join('\n');

    return [whitelist, remaining].join('\n');
  },
  getContentFromEditor: function () {
    var content;

    if (this.editors.content && this.editors.content.content) {
      // ProseMirror is loaded as content editor
      content = this.editors.content.getContent('markdown');
    }
    else if (this.editors.content) {
      // CodeMirror is loaded as content editor
      content = this.editors.content.doc.getValue();
    }

    return content;
  },
  getSettingsDisplayStyle: function (doc) {
    var displayStyle = 'only';

    if (doc.get('fileExt') === 'md' || doc.get('fileExt') === 'markdown') {
      displayStyle = (!doc.get('frontMatter')) ? 'regular' : 'whitelist';
    }

    return displayStyle;
  },
  toIsoDateString: function (date) {
    var d = (date) ? new Date(date) : new Date();
    return d.toISOString().substring(0, 10);
  }
});

module.exports = EditorView;
