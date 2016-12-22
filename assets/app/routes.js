import React from 'react';
import { Route, Link, IndexRedirect, IndexRoute, Redirect } from 'react-router';

import App from './components/app';
import SiteList from './components/siteList/siteList';
import SiteContainer from './components/siteContainer';
import SiteBuilds from './components/site/siteBuilds';
import SiteBuildLogs from './components/site/siteBuildLogs';
import SiteSettings from './components/site/siteSettings';
import NewSite from './components/AddSite';
import NotFound from './components/NotFound';

export default (
  <Route path="/" component={App}>
    <IndexRedirect to="sites"/>
    <Route path="sites">
      <IndexRoute component={SiteList}/>
      <Route path="new" component={NewSite} />
      <Route path=":id" component={SiteContainer}>
        <IndexRedirect to="settings" />
        <Route path="settings" component={SiteSettings}/>
        <Route path="builds">
          <IndexRoute component={SiteBuilds}/>
          <Route path=":buildId/logs" component={SiteBuildLogs}/>
        </Route>
      </Route>
      <Redirect from="*" to="/not-found"/>
    </Route>
    <Route path="/not-found" component={NotFound}/>
    <Redirect from="*" to="/sites"/>
  </Route>
);
