import React from 'react';
import PageListItem from './pageListItem';
import LinkButton from '../../linkButton';

import siteActions from '../../../actions/siteActions';

const propTypes = {
  site: React.PropTypes.object
};

class Pages extends React.Component {

  getClasses() {
    return 'usa-button-outline file-list-item-button';
  }

  getLinkFor(page, id, branch) {
    const pageName = page.name;

    return this.isDir(page) ?
      `/sites/${id}/tree/${pageName}` : `/sites/${id}/edit/${branch}/${pageName}`;
  }

  getButtonCopy(page) {
    return this.isDir(page) ? 'Open' : 'Edit';
  }

  isDir(page) {
    return page.type === 'dir';
  }

  getPagesFor(site) {
    const currentDirectory = this.props.params.fileName;
    const { files, childDirectoriesMap = {} } = site;

    let directoryContents;

    // User is on the pages index, return all files at the top level
    if (!currentDirectory) {
      return files;
    }

    directoryContents = childDirectoriesMap[currentDirectory];

    // There is no entry in the child directories map for the supplied folder
    // so fetch its content
    if (!directoryContents) {
      siteActions.fetchContent(site, currentDirectory);
      return [];
    }

    return directoryContents;
  }

  render() {
    const { site } = this.props;
    let pages;

    if (!site) {
      return null;
    }

    pages = this.getPagesFor(site) || [];

    return (
      <ul className="list-group">
        {pages.map((page, index) => {
          const { id, branch, defaultBranch } = site;

          return (
            <PageListItem key={index} pageName={page.name}>
              <LinkButton href={this.getLinkFor(page, id, branch || defaultBranch)}
                className={this.getClasses()}
                text={this.getButtonCopy(page)} />
            </PageListItem>
          );
        })}
      </ul>
    );
  }
}

Pages.propTypes = propTypes;

export default Pages;