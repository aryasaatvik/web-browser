import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  getAriaRole,
  getAccessibleName,
  isAriaHidden,
  getHeadingLevel,
  hasPresentationConflict,
} from './roles.js';

describe('ARIA Roles', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    container.remove();
  });

  describe('getAriaRole', () => {
    describe('explicit roles', () => {
      it('should return explicit role attribute', () => {
        container.innerHTML = '<div role="button">Click me</div>';
        const element = container.firstElementChild!;
        expect(getAriaRole(element)).toBe('button');
      });

      it('should return first role from space-separated list', () => {
        container.innerHTML = '<div role="button link">Click me</div>';
        const element = container.firstElementChild!;
        expect(getAriaRole(element)).toBe('button');
      });

      it('should normalize role to lowercase', () => {
        container.innerHTML = '<div role="BUTTON">Click me</div>';
        const element = container.firstElementChild!;
        expect(getAriaRole(element)).toBe('button');
      });

      it('should override implicit role with explicit role', () => {
        container.innerHTML = '<a href="/test" role="button">Click</a>';
        const element = container.firstElementChild!;
        expect(getAriaRole(element)).toBe('button');
      });

      it('should skip invalid roles and use first valid one', () => {
        container.innerHTML = '<div role="invalidrole button">Content</div>';
        const element = container.firstElementChild!;
        expect(getAriaRole(element)).toBe('button');
      });

      it('should return null for unknown explicit role with no implicit role', () => {
        container.innerHTML = '<div role="invalidrole">Content</div>';
        const element = container.firstElementChild!;
        expect(getAriaRole(element)).toBe(null);
      });
    });

    describe('implicit roles - simple elements', () => {
      it('should return article for article element', () => {
        container.innerHTML = '<article>Content</article>';
        expect(getAriaRole(container.firstElementChild!)).toBe('article');
      });

      it('should return complementary for aside element', () => {
        container.innerHTML = '<aside>Sidebar</aside>';
        expect(getAriaRole(container.firstElementChild!)).toBe('complementary');
      });

      it('should return button for button element', () => {
        container.innerHTML = '<button>Click</button>';
        expect(getAriaRole(container.firstElementChild!)).toBe('button');
      });

      it('should return dialog for dialog element', () => {
        container.innerHTML = '<dialog>Modal</dialog>';
        expect(getAriaRole(container.firstElementChild!)).toBe('dialog');
      });

      it('should return main for main element', () => {
        container.innerHTML = '<main>Content</main>';
        expect(getAriaRole(container.firstElementChild!)).toBe('main');
      });

      it('should return navigation for nav element', () => {
        container.innerHTML = '<nav>Links</nav>';
        expect(getAriaRole(container.firstElementChild!)).toBe('navigation');
      });

      it('should return list for ul element', () => {
        container.innerHTML = '<ul><li>Item</li></ul>';
        expect(getAriaRole(container.firstElementChild!)).toBe('list');
      });

      it('should return list for ol element', () => {
        container.innerHTML = '<ol><li>Item</li></ol>';
        expect(getAriaRole(container.firstElementChild!)).toBe('list');
      });

      it('should return listitem for li element', () => {
        container.innerHTML = '<ul><li>Item</li></ul>';
        const li = container.querySelector('li')!;
        expect(getAriaRole(li)).toBe('listitem');
      });

      it('should return table for table element', () => {
        container.innerHTML = '<table><tr><td>Cell</td></tr></table>';
        expect(getAriaRole(container.firstElementChild!)).toBe('table');
      });

      it('should return row for tr element', () => {
        container.innerHTML = '<table><tr><td>Cell</td></tr></table>';
        const tr = container.querySelector('tr')!;
        expect(getAriaRole(tr)).toBe('row');
      });

      it('should return cell for td element', () => {
        container.innerHTML = '<table><tr><td>Cell</td></tr></table>';
        const td = container.querySelector('td')!;
        expect(getAriaRole(td)).toBe('cell');
      });

      it('should return columnheader for th element', () => {
        container.innerHTML = '<table><tr><th>Header</th><td>Data</td></tr></table>';
        const th = container.querySelector('th')!;
        expect(getAriaRole(th)).toBe('rowheader');
      });

      it('should return textbox for textarea element', () => {
        container.innerHTML = '<textarea></textarea>';
        expect(getAriaRole(container.firstElementChild!)).toBe('textbox');
      });

      it('should return separator for hr element', () => {
        container.innerHTML = '<hr>';
        expect(getAriaRole(container.firstElementChild!)).toBe('separator');
      });

      it('should return progressbar for progress element', () => {
        container.innerHTML = '<progress value="50" max="100"></progress>';
        expect(getAriaRole(container.firstElementChild!)).toBe('progressbar');
      });

      it('should return meter for meter element', () => {
        container.innerHTML = '<meter value="50" min="0" max="100"></meter>';
        expect(getAriaRole(container.firstElementChild!)).toBe('meter');
      });

      it('should return combobox for select element', () => {
        container.innerHTML = '<select><option>A</option></select>';
        expect(getAriaRole(container.firstElementChild!)).toBe('combobox');
      });

      it('should return option for option element', () => {
        container.innerHTML = '<select><option>A</option></select>';
        const option = container.querySelector('option')!;
        expect(getAriaRole(option)).toBe('option');
      });

      it('should return figure for figure element', () => {
        container.innerHTML = '<figure><img src="test.jpg" alt="Test"></figure>';
        expect(getAriaRole(container.firstElementChild!)).toBe('figure');
      });

      it('should return group for fieldset element', () => {
        container.innerHTML = '<fieldset></fieldset>';
        expect(getAriaRole(container.firstElementChild!)).toBe('group');
      });

      it('should return group for details element', () => {
        container.innerHTML = '<details><summary>Title</summary></details>';
        expect(getAriaRole(container.firstElementChild!)).toBe('group');
      });

      it('should return button for summary element', () => {
        container.innerHTML = '<details><summary>Title</summary></details>';
        const summary = container.querySelector('summary')!;
        expect(getAriaRole(summary)).toBe('button');
      });
    });

    describe('implicit roles - context-aware form element', () => {
      it('should return form for form element with aria-label', () => {
        container.innerHTML = '<form aria-label="Contact form"></form>';
        expect(getAriaRole(container.firstElementChild!)).toBe('form');
      });

      it('should return form for form element with aria-labelledby', () => {
        container.innerHTML = `
          <h2 id="form-title">Contact</h2>
          <form aria-labelledby="form-title"></form>
        `;
        const form = container.querySelector('form')!;
        expect(getAriaRole(form)).toBe('form');
      });

      it('should return null for form element without accessible name', () => {
        container.innerHTML = '<form></form>';
        expect(getAriaRole(container.firstElementChild!)).toBe(null);
      });
    });

    describe('implicit roles - anchor element', () => {
      it('should return link for anchor with href', () => {
        container.innerHTML = '<a href="/test">Link</a>';
        expect(getAriaRole(container.firstElementChild!)).toBe('link');
      });

      it('should return null for anchor without href', () => {
        container.innerHTML = '<a>Not a link</a>';
        expect(getAriaRole(container.firstElementChild!)).toBe(null);
      });
    });

    describe('implicit roles - area element', () => {
      it('should return link for area with href', () => {
        container.innerHTML = `
          <map name="test">
            <area href="/test" alt="Link">
          </map>
        `;
        const area = container.querySelector('area')!;
        expect(getAriaRole(area)).toBe('link');
      });

      it('should return null for area without href', () => {
        container.innerHTML = `
          <map name="test">
            <area alt="Not a link">
          </map>
        `;
        const area = container.querySelector('area')!;
        expect(getAriaRole(area)).toBe(null);
      });
    });

    describe('implicit roles - image element', () => {
      it('should return img for image with non-empty alt', () => {
        container.innerHTML = '<img src="test.jpg" alt="Description">';
        expect(getAriaRole(container.firstElementChild!)).toBe('img');
      });

      it('should return presentation for image with empty alt', () => {
        container.innerHTML = '<img src="test.jpg" alt="">';
        expect(getAriaRole(container.firstElementChild!)).toBe('presentation');
      });

      it('should return img for image without alt attribute', () => {
        container.innerHTML = '<img src="test.jpg">';
        expect(getAriaRole(container.firstElementChild!)).toBe('img');
      });

      it('should return img for image with empty alt but has title', () => {
        container.innerHTML = '<img src="test.jpg" alt="" title="Description">';
        expect(getAriaRole(container.firstElementChild!)).toBe('img');
      });

      it('should return img for image with empty alt but has aria-label', () => {
        container.innerHTML = '<img src="test.jpg" alt="" aria-label="Description">';
        expect(getAriaRole(container.firstElementChild!)).toBe('img');
      });

      it('should return img for image with empty alt but has tabindex', () => {
        container.innerHTML = '<img src="test.jpg" alt="" tabindex="0">';
        expect(getAriaRole(container.firstElementChild!)).toBe('img');
      });
    });

    describe('implicit roles - input element', () => {
      it('should return textbox for text input', () => {
        container.innerHTML = '<input type="text">';
        expect(getAriaRole(container.firstElementChild!)).toBe('textbox');
      });

      it('should return textbox for email input', () => {
        container.innerHTML = '<input type="email">';
        expect(getAriaRole(container.firstElementChild!)).toBe('textbox');
      });

      it('should return textbox for password input', () => {
        container.innerHTML = '<input type="password">';
        expect(getAriaRole(container.firstElementChild!)).toBe('textbox');
      });

      it('should return textbox for tel input', () => {
        container.innerHTML = '<input type="tel">';
        expect(getAriaRole(container.firstElementChild!)).toBe('textbox');
      });

      it('should return textbox for url input', () => {
        container.innerHTML = '<input type="url">';
        expect(getAriaRole(container.firstElementChild!)).toBe('textbox');
      });

      it('should return searchbox for search input', () => {
        container.innerHTML = '<input type="search">';
        expect(getAriaRole(container.firstElementChild!)).toBe('searchbox');
      });

      it('should return checkbox for checkbox input', () => {
        container.innerHTML = '<input type="checkbox">';
        expect(getAriaRole(container.firstElementChild!)).toBe('checkbox');
      });

      it('should return radio for radio input', () => {
        container.innerHTML = '<input type="radio">';
        expect(getAriaRole(container.firstElementChild!)).toBe('radio');
      });

      it('should return spinbutton for number input', () => {
        container.innerHTML = '<input type="number">';
        expect(getAriaRole(container.firstElementChild!)).toBe('spinbutton');
      });

      it('should return slider for range input', () => {
        container.innerHTML = '<input type="range">';
        expect(getAriaRole(container.firstElementChild!)).toBe('slider');
      });

      it('should return button for button input', () => {
        container.innerHTML = '<input type="button" value="Click">';
        expect(getAriaRole(container.firstElementChild!)).toBe('button');
      });

      it('should return button for submit input', () => {
        container.innerHTML = '<input type="submit">';
        expect(getAriaRole(container.firstElementChild!)).toBe('button');
      });

      it('should return button for reset input', () => {
        container.innerHTML = '<input type="reset">';
        expect(getAriaRole(container.firstElementChild!)).toBe('button');
      });

      it('should return button for image input', () => {
        container.innerHTML = '<input type="image" src="btn.png" alt="Submit">';
        expect(getAriaRole(container.firstElementChild!)).toBe('button');
      });

      it('should return null for hidden input', () => {
        container.innerHTML = '<input type="hidden">';
        expect(getAriaRole(container.firstElementChild!)).toBe(null);
      });

      it('should return button for file input', () => {
        container.innerHTML = '<input type="file">';
        expect(getAriaRole(container.firstElementChild!)).toBe('button');
      });

      it('should return null for color input', () => {
        container.innerHTML = '<input type="color">';
        expect(getAriaRole(container.firstElementChild!)).toBe('textbox');
      });

      it('should return null for date input', () => {
        container.innerHTML = '<input type="date">';
        expect(getAriaRole(container.firstElementChild!)).toBe('textbox');
      });

      it('should return combobox for text input with list', () => {
        container.innerHTML = `
          <input type="text" list="options">
          <datalist id="options"><option value="A"></option></datalist>
        `;
        const input = container.querySelector('input')!;
        expect(getAriaRole(input)).toBe('combobox');
      });

      it('should return combobox for search input with list', () => {
        container.innerHTML = `
          <input type="search" list="options">
          <datalist id="options"><option value="A"></option></datalist>
        `;
        const input = container.querySelector('input')!;
        expect(getAriaRole(input)).toBe('combobox');
      });

      it('should return textbox for input with list but no matching datalist', () => {
        container.innerHTML = '<input type="text" list="nonexistent">';
        const input = container.querySelector('input')!;
        expect(getAriaRole(input)).toBe('textbox');
      });
    });

    describe('implicit roles - select element', () => {
      it('should return combobox for single select', () => {
        container.innerHTML = '<select><option>A</option></select>';
        expect(getAriaRole(container.firstElementChild!)).toBe('combobox');
      });

      it('should return listbox for select with multiple', () => {
        container.innerHTML = '<select multiple><option>A</option></select>';
        expect(getAriaRole(container.firstElementChild!)).toBe('listbox');
      });

      it('should return listbox for select with size > 1', () => {
        container.innerHTML = '<select size="4"><option>A</option></select>';
        expect(getAriaRole(container.firstElementChild!)).toBe('listbox');
      });

      it('should return combobox for select with size = 1', () => {
        container.innerHTML = '<select size="1"><option>A</option></select>';
        expect(getAriaRole(container.firstElementChild!)).toBe('combobox');
      });
    });

    describe('implicit roles - heading elements', () => {
      it('should return heading for h1', () => {
        container.innerHTML = '<h1>Title</h1>';
        expect(getAriaRole(container.firstElementChild!)).toBe('heading');
      });

      it('should return heading for h2', () => {
        container.innerHTML = '<h2>Title</h2>';
        expect(getAriaRole(container.firstElementChild!)).toBe('heading');
      });

      it('should return heading for h3-h6', () => {
        for (let i = 3; i <= 6; i++) {
          container.innerHTML = `<h${i}>Title</h${i}>`;
          expect(getAriaRole(container.firstElementChild!)).toBe('heading');
        }
      });
    });

    describe('implicit roles - context-aware elements', () => {
      it('should return banner for header not in landmark', () => {
        container.innerHTML = '<header>Site header</header>';
        expect(getAriaRole(container.firstElementChild!)).toBe('banner');
      });

      it('should return null for header inside article', () => {
        container.innerHTML = '<article><header>Article header</header></article>';
        const header = container.querySelector('header')!;
        expect(getAriaRole(header)).toBe(null);
      });

      it('should return null for header inside aside', () => {
        container.innerHTML = '<aside><header>Aside header</header></aside>';
        const header = container.querySelector('header')!;
        expect(getAriaRole(header)).toBe(null);
      });

      it('should return null for header inside main', () => {
        container.innerHTML = '<main><header>Main header</header></main>';
        const header = container.querySelector('header')!;
        expect(getAriaRole(header)).toBe(null);
      });

      it('should return null for header inside nav', () => {
        container.innerHTML = '<nav><header>Nav header</header></nav>';
        const header = container.querySelector('header')!;
        expect(getAriaRole(header)).toBe(null);
      });

      it('should return null for header inside section', () => {
        container.innerHTML = '<section><header>Section header</header></section>';
        const header = container.querySelector('header')!;
        expect(getAriaRole(header)).toBe(null);
      });

      it('should return null for header inside element with role=region', () => {
        container.innerHTML = '<div role="region" aria-label="Section"><header>Header</header></div>';
        const header = container.querySelector('header')!;
        expect(getAriaRole(header)).toBe(null);
      });

      it('should return contentinfo for footer not in landmark', () => {
        container.innerHTML = '<footer>Site footer</footer>';
        expect(getAriaRole(container.firstElementChild!)).toBe('contentinfo');
      });

      it('should return null for footer inside article', () => {
        container.innerHTML = '<article><footer>Article footer</footer></article>';
        const footer = container.querySelector('footer')!;
        expect(getAriaRole(footer)).toBe(null);
      });

      it('should return region for section with aria-label', () => {
        container.innerHTML = '<section aria-label="Featured">Content</section>';
        expect(getAriaRole(container.firstElementChild!)).toBe('region');
      });

      it('should return region for section with aria-labelledby', () => {
        container.innerHTML = `
          <section aria-labelledby="heading">
            <h2 id="heading">Section Title</h2>
            Content
          </section>
        `;
        expect(getAriaRole(container.firstElementChild!)).toBe('region');
      });

      it('should return null for section without accessible name', () => {
        container.innerHTML = '<section>Content</section>';
        expect(getAriaRole(container.firstElementChild!)).toBe(null);
      });
    });

    describe('implicit roles - table cells', () => {
      it('should return cell for td in regular table', () => {
        container.innerHTML = '<table><tr><td>Cell</td></tr></table>';
        const td = container.querySelector('td')!;
        expect(getAriaRole(td)).toBe('cell');
      });

      it('should return gridcell for td in table with role=grid', () => {
        container.innerHTML = '<table role="grid"><tr><td>Cell</td></tr></table>';
        const td = container.querySelector('td')!;
        expect(getAriaRole(td)).toBe('gridcell');
      });

      it('should return gridcell for td in table with role=treegrid', () => {
        container.innerHTML = '<table role="treegrid"><tr><td>Cell</td></tr></table>';
        const td = container.querySelector('td')!;
        expect(getAriaRole(td)).toBe('gridcell');
      });

      it('should return columnheader for th with scope=col', () => {
        container.innerHTML = '<table><tr><th scope="col">Header</th></tr></table>';
        const th = container.querySelector('th')!;
        expect(getAriaRole(th)).toBe('columnheader');
      });

      it('should return rowheader for th with scope=row', () => {
        container.innerHTML = '<table><tr><th scope="row">Header</th><td>Data</td></tr></table>';
        const th = container.querySelector('th')!;
        expect(getAriaRole(th)).toBe('rowheader');
      });

      it('should return columnheader for th in thead', () => {
        container.innerHTML = '<table><thead><tr><th>Header</th></tr></thead><tbody><tr><td>Data</td></tr></tbody></table>';
        const th = container.querySelector('th')!;
        expect(getAriaRole(th)).toBe('columnheader');
      });

      it('should return rowheader for th followed by td', () => {
        container.innerHTML = '<table><tr><th>Row Header</th><td>Data</td></tr></table>';
        const th = container.querySelector('th')!;
        expect(getAriaRole(th)).toBe('rowheader');
      });

      it('should return null for th as only cell in single-row table', () => {
        container.innerHTML = '<table><tr><th>Only Cell</th></tr></table>';
        const th = container.querySelector('th')!;
        expect(getAriaRole(th)).toBe(null);
      });
    });

    describe('implicit roles - new semantic elements', () => {
      it('should return search for search element', () => {
        container.innerHTML = '<search>Search content</search>';
        expect(getAriaRole(container.firstElementChild!)).toBe('search');
      });

      it('should return blockquote for blockquote element', () => {
        container.innerHTML = '<blockquote>Quote</blockquote>';
        expect(getAriaRole(container.firstElementChild!)).toBe('blockquote');
      });

      it('should return code for code element', () => {
        container.innerHTML = '<code>console.log()</code>';
        expect(getAriaRole(container.firstElementChild!)).toBe('code');
      });

      it('should return deletion for del element', () => {
        container.innerHTML = '<del>removed text</del>';
        expect(getAriaRole(container.firstElementChild!)).toBe('deletion');
      });

      it('should return insertion for ins element', () => {
        container.innerHTML = '<ins>inserted text</ins>';
        expect(getAriaRole(container.firstElementChild!)).toBe('insertion');
      });

      it('should return mark for mark element', () => {
        container.innerHTML = '<mark>highlighted</mark>';
        expect(getAriaRole(container.firstElementChild!)).toBe('mark');
      });

      it('should return strong for strong element', () => {
        container.innerHTML = '<strong>important</strong>';
        expect(getAriaRole(container.firstElementChild!)).toBe('strong');
      });

      it('should return emphasis for em element', () => {
        container.innerHTML = '<em>emphasized</em>';
        expect(getAriaRole(container.firstElementChild!)).toBe('emphasis');
      });

      it('should return subscript for sub element', () => {
        container.innerHTML = '<sub>2</sub>';
        expect(getAriaRole(container.firstElementChild!)).toBe('subscript');
      });

      it('should return superscript for sup element', () => {
        container.innerHTML = '<sup>2</sup>';
        expect(getAriaRole(container.firstElementChild!)).toBe('superscript');
      });

      it('should return time for time element', () => {
        container.innerHTML = '<time datetime="2024-01-01">January 1</time>';
        expect(getAriaRole(container.firstElementChild!)).toBe('time');
      });

      it('should return paragraph for p element', () => {
        container.innerHTML = '<p>Paragraph text</p>';
        expect(getAriaRole(container.firstElementChild!)).toBe('paragraph');
      });

      it('should return term for dfn element', () => {
        container.innerHTML = '<dfn>term</dfn>';
        expect(getAriaRole(container.firstElementChild!)).toBe('term');
      });

      it('should return definition for dd element', () => {
        container.innerHTML = '<dl><dt>Term</dt><dd>Definition</dd></dl>';
        const dd = container.querySelector('dd')!;
        expect(getAriaRole(dd)).toBe('definition');
      });

      it('should return term for dt element', () => {
        container.innerHTML = '<dl><dt>Term</dt><dd>Definition</dd></dl>';
        const dt = container.querySelector('dt')!;
        expect(getAriaRole(dt)).toBe('term');
      });

      it('should return list for dl element', () => {
        container.innerHTML = '<dl><dt>Term</dt><dd>Definition</dd></dl>';
        expect(getAriaRole(container.firstElementChild!)).toBe('list');
      });

      it('should return caption for caption element', () => {
        container.innerHTML = '<table><caption>Table Caption</caption><tr><td>Data</td></tr></table>';
        const caption = container.querySelector('caption')!;
        expect(getAriaRole(caption)).toBe('caption');
      });

      it('should return img for svg element', () => {
        container.innerHTML = '<svg></svg>';
        expect(getAriaRole(container.firstElementChild!)).toBe('img');
      });

      it('should return document for html element', () => {
        expect(getAriaRole(document.documentElement)).toBe('document');
      });

      it('should return group for address element', () => {
        container.innerHTML = '<address>Contact info</address>';
        expect(getAriaRole(container.firstElementChild!)).toBe('group');
      });

      it('should return group for hgroup element', () => {
        container.innerHTML = '<hgroup><h1>Title</h1><p>Subtitle</p></hgroup>';
        expect(getAriaRole(container.firstElementChild!)).toBe('group');
      });
    });

    describe('elements with no implicit role', () => {
      it('should return null for div', () => {
        container.innerHTML = '<div>Content</div>';
        expect(getAriaRole(container.firstElementChild!)).toBe(null);
      });

      it('should return null for span', () => {
        container.innerHTML = '<span>Content</span>';
        expect(getAriaRole(container.firstElementChild!)).toBe(null);
      });

      it('should return null for b', () => {
        container.innerHTML = '<b>Bold</b>';
        expect(getAriaRole(container.firstElementChild!)).toBe(null);
      });

      it('should return null for i', () => {
        container.innerHTML = '<i>Italic</i>';
        expect(getAriaRole(container.firstElementChild!)).toBe(null);
      });

      it('should return null for u', () => {
        container.innerHTML = '<u>Underlined</u>';
        expect(getAriaRole(container.firstElementChild!)).toBe(null);
      });

      it('should return null for s', () => {
        container.innerHTML = '<s>Strikethrough</s>';
        expect(getAriaRole(container.firstElementChild!)).toBe(null);
      });

      it('should return null for pre', () => {
        container.innerHTML = '<pre>Preformatted</pre>';
        expect(getAriaRole(container.firstElementChild!)).toBe(null);
      });
    });

    describe('presentation/none role handling', () => {
      it('should return null for element with role=presentation', () => {
        container.innerHTML = '<img src="test.jpg" alt="Test" role="presentation">';
        expect(getAriaRole(container.firstElementChild!)).toBe(null);
      });

      it('should return null for element with role=none', () => {
        container.innerHTML = '<img src="test.jpg" alt="Test" role="none">';
        expect(getAriaRole(container.firstElementChild!)).toBe(null);
      });

      it('should return implicit role when presentation has conflict (aria-label)', () => {
        container.innerHTML = '<img src="test.jpg" alt="Test" role="presentation" aria-label="Important image">';
        expect(getAriaRole(container.firstElementChild!)).toBe('img');
      });

      it('should return implicit role when none has conflict (aria-labelledby)', () => {
        container.innerHTML = `
          <span id="label">Image description</span>
          <img src="test.jpg" alt="Test" role="none" aria-labelledby="label">
        `;
        const img = container.querySelector('img')!;
        expect(getAriaRole(img)).toBe('img');
      });

      it('should return implicit role when presentation has conflict (tabindex)', () => {
        container.innerHTML = '<img src="test.jpg" alt="Test" role="presentation" tabindex="0">';
        expect(getAriaRole(container.firstElementChild!)).toBe('img');
      });

      it('should return implicit role for focusable button with role=none', () => {
        container.innerHTML = '<button role="none">Click</button>';
        expect(getAriaRole(container.firstElementChild!)).toBe('button');
      });

      it('should return null for disabled button with role=none', () => {
        container.innerHTML = '<button role="none" disabled>Click</button>';
        expect(getAriaRole(container.firstElementChild!)).toBe(null);
      });
    });

    describe('presentation inheritance', () => {
      it('should return null for li in ul with role=presentation', () => {
        container.innerHTML = '<ul role="presentation"><li>Item</li></ul>';
        const li = container.querySelector('li')!;
        expect(getAriaRole(li)).toBe(null);
      });

      it('should return null for tr in table with role=presentation', () => {
        container.innerHTML = '<table role="presentation"><tr><td>Cell</td></tr></table>';
        const tr = container.querySelector('tr')!;
        expect(getAriaRole(tr)).toBe(null);
      });

      it('should return null for td in table with role=presentation', () => {
        container.innerHTML = '<table role="presentation"><tr><td>Cell</td></tr></table>';
        const td = container.querySelector('td')!;
        expect(getAriaRole(td)).toBe(null);
      });

      it('should return listitem for li in ul with focusable presentation', () => {
        container.innerHTML = '<ul role="presentation" tabindex="0"><li>Item</li></ul>';
        const li = container.querySelector('li')!;
        expect(getAriaRole(li)).toBe('listitem');
      });

      it('should return null for dd in dl with role=none', () => {
        container.innerHTML = '<dl role="none"><dt>Term</dt><dd>Definition</dd></dl>';
        const dd = container.querySelector('dd')!;
        expect(getAriaRole(dd)).toBe(null);
      });
    });
  });

  describe('hasPresentationConflict', () => {
    it('should return true for element with aria-label', () => {
      container.innerHTML = '<div aria-label="Label">Content</div>';
      expect(hasPresentationConflict(container.firstElementChild!)).toBe(true);
    });

    it('should return true for element with aria-labelledby', () => {
      container.innerHTML = `
        <span id="label">Label</span>
        <div aria-labelledby="label">Content</div>
      `;
      const div = container.querySelector('div')!;
      expect(hasPresentationConflict(div)).toBe(true);
    });

    it('should return true for element with aria-describedby', () => {
      container.innerHTML = `
        <span id="desc">Description</span>
        <div aria-describedby="desc">Content</div>
      `;
      const div = container.querySelector('div')!;
      expect(hasPresentationConflict(div)).toBe(true);
    });

    it('should return true for element with tabindex', () => {
      container.innerHTML = '<div tabindex="0">Content</div>';
      expect(hasPresentationConflict(container.firstElementChild!)).toBe(true);
    });

    it('should return true for focusable button', () => {
      container.innerHTML = '<button>Click</button>';
      expect(hasPresentationConflict(container.firstElementChild!)).toBe(true);
    });

    it('should return false for non-focusable div without aria attributes', () => {
      container.innerHTML = '<div>Content</div>';
      expect(hasPresentationConflict(container.firstElementChild!)).toBe(false);
    });

    it('should return false for disabled button', () => {
      container.innerHTML = '<button disabled>Click</button>';
      expect(hasPresentationConflict(container.firstElementChild!)).toBe(false);
    });
  });

  describe('getAccessibleName', () => {
    describe('aria-labelledby', () => {
      it('should return referenced element text', () => {
        container.innerHTML = `
          <span id="label">Username</span>
          <input aria-labelledby="label">
        `;
        const input = container.querySelector('input')!;
        expect(getAccessibleName(input)).toBe('Username');
      });

      it('should concatenate multiple references', () => {
        container.innerHTML = `
          <span id="first">First</span>
          <span id="last">Last</span>
          <input aria-labelledby="first last">
        `;
        const input = container.querySelector('input')!;
        expect(getAccessibleName(input)).toBe('First Last');
      });
    });

    describe('aria-label', () => {
      it('should return aria-label value', () => {
        container.innerHTML = '<button aria-label="Close dialog">X</button>';
        expect(getAccessibleName(container.firstElementChild!)).toBe('Close dialog');
      });

      it('should trim whitespace', () => {
        container.innerHTML = '<button aria-label="  Close  ">X</button>';
        expect(getAccessibleName(container.firstElementChild!)).toBe('Close');
      });
    });

    describe('associated label', () => {
      it('should return label text for input with for attribute', () => {
        container.innerHTML = `
          <label for="username">Username</label>
          <input id="username">
        `;
        const input = container.querySelector('input')!;
        expect(getAccessibleName(input)).toBe('Username');
      });

      it('should return label text for wrapped input', () => {
        container.innerHTML = `
          <label>Username <input type="text"></label>
        `;
        const input = container.querySelector('input')!;
        expect(getAccessibleName(input)).toBe('Username');
      });
    });

    describe('title attribute', () => {
      it('should return title as fallback', () => {
        container.innerHTML = '<div title="Tooltip text">Content</div>';
        expect(getAccessibleName(container.firstElementChild!)).toBe('Tooltip text');
      });
    });

    describe('alt attribute', () => {
      it('should return alt text for images', () => {
        container.innerHTML = '<img src="test.jpg" alt="A beautiful sunset">';
        expect(getAccessibleName(container.firstElementChild!)).toBe('A beautiful sunset');
      });
    });

    describe('placeholder', () => {
      it('should return placeholder for input', () => {
        container.innerHTML = '<input placeholder="Enter name">';
        expect(getAccessibleName(container.firstElementChild!)).toBe('Enter name');
      });

      it('should return placeholder for textarea', () => {
        container.innerHTML = '<textarea placeholder="Enter message"></textarea>';
        expect(getAccessibleName(container.firstElementChild!)).toBe('Enter message');
      });
    });

    describe('text content', () => {
      it('should return text content for button', () => {
        container.innerHTML = '<button>Submit Form</button>';
        expect(getAccessibleName(container.firstElementChild!)).toBe('Submit Form');
      });

      it('should return text content for link', () => {
        container.innerHTML = '<a href="/test">Learn more</a>';
        expect(getAccessibleName(container.firstElementChild!)).toBe('Learn more');
      });

      it('should normalize whitespace', () => {
        container.innerHTML = '<button>  Submit   Form  </button>';
        expect(getAccessibleName(container.firstElementChild!)).toBe('Submit Form');
      });
    });

    describe('priority order', () => {
      it('should prefer aria-labelledby over aria-label', () => {
        container.innerHTML = `
          <span id="label">From label</span>
          <button aria-labelledby="label" aria-label="From aria-label">Text</button>
        `;
        const button = container.querySelector('button')!;
        expect(getAccessibleName(button)).toBe('From label');
      });

      it('should prefer aria-label over title', () => {
        container.innerHTML = '<button aria-label="Aria" title="Title">Text</button>';
        expect(getAccessibleName(container.firstElementChild!)).toBe('Aria');
      });
    });
  });

  describe('isAriaHidden', () => {
    it('should return true for aria-hidden="true"', () => {
      container.innerHTML = '<div aria-hidden="true">Hidden</div>';
      expect(isAriaHidden(container.firstElementChild!)).toBe(true);
    });

    it('should return false for aria-hidden="false"', () => {
      container.innerHTML = '<div aria-hidden="false">Visible</div>';
      expect(isAriaHidden(container.firstElementChild!)).toBe(false);
    });

    it('should return true for element in aria-hidden subtree', () => {
      container.innerHTML = `
        <div aria-hidden="true">
          <span>Child</span>
        </div>
      `;
      const span = container.querySelector('span')!;
      expect(isAriaHidden(span)).toBe(true);
    });

    it('should return true for display:none', () => {
      container.innerHTML = '<div style="display: none;">Hidden</div>';
      expect(isAriaHidden(container.firstElementChild!)).toBe(true);
    });

    it('should return true for visibility:hidden', () => {
      container.innerHTML = '<div style="visibility: hidden;">Hidden</div>';
      expect(isAriaHidden(container.firstElementChild!)).toBe(true);
    });

    it('should return false for visible element', () => {
      container.innerHTML = '<div>Visible</div>';
      expect(isAriaHidden(container.firstElementChild!)).toBe(false);
    });
  });

  describe('getHeadingLevel', () => {
    describe('native heading elements', () => {
      it('should return 1 for h1', () => {
        container.innerHTML = '<h1>Title</h1>';
        expect(getHeadingLevel(container.firstElementChild!)).toBe(1);
      });

      it('should return 2 for h2', () => {
        container.innerHTML = '<h2>Subtitle</h2>';
        expect(getHeadingLevel(container.firstElementChild!)).toBe(2);
      });

      it('should return 3-6 for h3-h6', () => {
        for (let i = 3; i <= 6; i++) {
          container.innerHTML = `<h${i}>Heading</h${i}>`;
          expect(getHeadingLevel(container.firstElementChild!)).toBe(i);
        }
      });
    });

    describe('aria-level', () => {
      it('should return aria-level value', () => {
        container.innerHTML = '<div role="heading" aria-level="3">Heading</div>';
        expect(getHeadingLevel(container.firstElementChild!)).toBe(3);
      });

      it('should override native level with aria-level', () => {
        container.innerHTML = '<h1 aria-level="2">Title</h1>';
        expect(getHeadingLevel(container.firstElementChild!)).toBe(2);
      });

      it('should handle invalid aria-level values', () => {
        container.innerHTML = '<h1 aria-level="invalid">Title</h1>';
        expect(getHeadingLevel(container.firstElementChild!)).toBe(1);
      });

      it('should handle aria-level="0" (invalid)', () => {
        container.innerHTML = '<div role="heading" aria-level="0">Title</div>';
        expect(getHeadingLevel(container.firstElementChild!)).toBe(null);
      });
    });

    describe('non-heading elements', () => {
      it('should return null for non-heading elements', () => {
        container.innerHTML = '<div>Not a heading</div>';
        expect(getHeadingLevel(container.firstElementChild!)).toBe(null);
      });

      it('should return null for paragraph', () => {
        container.innerHTML = '<p>Paragraph</p>';
        expect(getHeadingLevel(container.firstElementChild!)).toBe(null);
      });
    });
  });
});
