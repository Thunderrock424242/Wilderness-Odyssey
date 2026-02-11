let config = {};
let currentImageIndex = 0;

const defaultFeatures = [
    {
        title: 'Epic Exploration',
        description: 'Discover dozens of new biomes, structures, and dimensions to explore.',
        icon: '🗺️'
    },
    {
        title: 'Challenging Combat',
        description: 'Face powerful bosses and enhanced mobs with new weapons and armor.',
        icon: '⚔️'
    },
    {
        title: 'Quest System',
        description: 'Follow guided questlines that lead you through the adventure.',
        icon: '📜'
    },
    {
        title: 'Balanced Progression',
        description: 'Carefully tuned gameplay that rewards exploration and skill.',
        icon: '⭐'
    }
];

const defaultGallery = [
    {
        url: 'https://via.placeholder.com/800x450/1f2937/fbbf24?text=Screenshot+1',
        title: 'Add Your Screenshots',
        description: 'Edit config.json to add your images.'
    },
    {
        url: 'https://via.placeholder.com/800x450/1f2937/fbbf24?text=Screenshot+2',
        title: 'Epic Moments',
        description: 'Showcase your modpack gameplay.'
    }
];

const defaultWikiCategories = [
    'Getting Started',
    'Mods List',
    'Progression Guide',
    'Dimensions',
    'Bosses',
    'FAQ'
];

async function loadConfig() {
    try {
        const response = await fetch('config.json');
        config = await response.json();
    } catch (error) {
        console.error('Error loading config.json:', error);
        config = {};
    }

    populateWebsite();
    applyTheme();
}

function normalizeGithubRepo(repoValue) {
    if (!repoValue) {
        return '';
    }

    const cleaned = repoValue.trim().replace(/\.git$/, '');
    if (cleaned.startsWith('http://') || cleaned.startsWith('https://')) {
        const parts = cleaned.split('/').filter(Boolean);
        const owner = parts[parts.length - 2];
        const repo = parts[parts.length - 1];
        return owner && repo ? `${owner}/${repo}` : '';
    }

    return cleaned.replace(/^github\.com\//, '');
}

function getGithubUrls() {
    const fallbackRepo = normalizeGithubRepo(config.wiki?.githubRepo) || 'yourusername/modpack-wiki';
    const linkRepo = normalizeGithubRepo(config.links?.github) || fallbackRepo;
    const repo = linkRepo || fallbackRepo;
    const branch = config.wiki?.branch || 'main';

    return {
        repo,
        branch,
        repoUrl: `https://github.com/${repo}`,
        docsBase: `https://github.com/${repo}/blob/${branch}/wiki`
    };
}

function populateWebsite() {
    document.title = config.modpack?.name || 'Modpack';
    document.getElementById('page-title').textContent = document.title;
    document.getElementById('nav-logo').textContent = config.modpack?.name || 'Modpack';

    document.getElementById('hero-title').textContent = config.modpack?.name || 'Your Modpack Name';
    document.getElementById('hero-tagline').textContent = config.modpack?.tagline || 'An Epic Adventure Awaits';
    document.getElementById('hero-description').textContent = config.modpack?.description || 'Configure your modpack details in config.json.';
    document.getElementById('mc-version').textContent = config.modpack?.minecraftVersion || '1.20.1';
    document.getElementById('pack-version').textContent = config.modpack?.version || '1.0.0';

    const curseforgeUrl = config.links?.curseforge || '#';
    const discordUrl = config.links?.discord || '';
    const githubUrls = getGithubUrls();

    document.getElementById('hero-download').href = curseforgeUrl;
    document.getElementById('download-btn').href = curseforgeUrl;
    document.getElementById('github-link').href = githubUrls.repoUrl;
    document.getElementById('github-wiki-link').href = githubUrls.repoUrl;

    const discordLink = document.getElementById('discord-link');
    if (discordUrl) {
        discordLink.href = discordUrl;
        discordLink.style.display = 'inline-flex';
    } else {
        discordLink.style.display = 'none';
    }

    populateFeatures();
    populateGallery();
    populateWikiHub(githubUrls);
}

function populateFeatures() {
    const featuresGrid = document.getElementById('features-grid');
    const features = config.features?.length ? config.features : defaultFeatures;

    featuresGrid.innerHTML = '';
    features.forEach((feature) => {
        const card = document.createElement('article');
        card.className = 'feature-card';
        card.innerHTML = `
            <span class="feature-icon">${feature.icon || '✨'}</span>
            <h3>${feature.title || 'Feature'}</h3>
            <p>${feature.description || ''}</p>
        `;
        featuresGrid.appendChild(card);
    });
}

function populateGallery() {
    const galleryGrid = document.getElementById('gallery-grid');
    const images = config.gallery?.images?.length ? config.gallery.images : defaultGallery;

    galleryGrid.innerHTML = '';
    images.forEach((image, index) => {
        const item = document.createElement('article');
        item.className = 'gallery-item';
        item.innerHTML = `
            <img src="${image.url}" alt="${image.title || 'Gallery image'}" loading="lazy">
            <div class="gallery-overlay">
                <h3>${image.title || 'Screenshot'}</h3>
                <p>${image.description || ''}</p>
            </div>
        `;

        const galleryImage = item.querySelector('img');
        galleryImage.addEventListener('error', () => {
            galleryImage.src = 'https://via.placeholder.com/800x450/1f2937/fbbf24?text=Add+Screenshot';
        }, { once: true });

        item.addEventListener('click', () => openLightbox(index));
        galleryGrid.appendChild(item);
    });
}

function populateWikiHub(githubUrls) {
    const categories = config.wiki?.categories?.length ? config.wiki.categories : defaultWikiCategories;
    const pages = config.wiki?.pages?.length
        ? config.wiki.pages
        : categories.slice(0, 4).map((category) => ({
            title: category,
            summary: `Open the ${category} documentation page.`,
            file: `${category.toLowerCase().replace(/\s+/g, '-')}.md`
        }));

    const categoriesContainer = document.getElementById('wiki-categories');
    const pagesContainer = document.getElementById('wiki-pages');

    categoriesContainer.innerHTML = '';
    pagesContainer.innerHTML = '';

    categories.forEach((category) => {
        const categorySlug = category.toLowerCase().replace(/\s+/g, '-');
        const link = document.createElement('a');
        link.className = 'wiki-category';
        link.href = `${githubUrls.docsBase}/${categorySlug}.md`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = category;
        categoriesContainer.appendChild(link);
    });

    pages.forEach((page) => {
        const fileName = (page.file || `${page.title || 'wiki-page'}.md`).replace(/^\//, '');
        const pageTitle = page.title || 'Wiki Page';
        const pageSummary = page.summary || 'Open this page in the wiki repository.';

        const card = document.createElement('article');
        card.className = 'wiki-page-card';
        card.innerHTML = `
            <h4>${pageTitle}</h4>
            <p>${pageSummary}</p>
            <a class="wiki-page-link" href="${githubUrls.docsBase}/${fileName}" target="_blank" rel="noopener noreferrer">Read page →</a>
        `;
        pagesContainer.appendChild(card);
    });
}

function applyTheme() {
    if (!config.theme) {
        return;
    }

    const root = document.documentElement;
    if (config.theme.primaryColor) root.style.setProperty('--primary-color', config.theme.primaryColor);
    if (config.theme.secondaryColor) root.style.setProperty('--secondary-color', config.theme.secondaryColor);
    if (config.theme.accentColor) root.style.setProperty('--accent-color', config.theme.accentColor);
    if (config.theme.backgroundColor) root.style.setProperty('--bg-color', config.theme.backgroundColor);
    if (config.theme.textColor) root.style.setProperty('--text-color', config.theme.textColor);
}

function getGalleryImages() {
    return config.gallery?.images?.length ? config.gallery.images : defaultGallery;
}

function openLightbox(index) {
    const images = getGalleryImages();
    if (!images.length) {
        return;
    }

    currentImageIndex = index;

    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxCaption = document.getElementById('lightbox-caption');

    const current = images[currentImageIndex];
    lightboxImg.src = current.url;
    lightboxImg.alt = current.title || 'Gallery image';
    lightboxCaption.innerHTML = `
        <h3>${current.title || 'Screenshot'}</h3>
        <p>${current.description || ''}</p>
    `;

    lightbox.classList.add('active');
}

function closeLightbox() {
    document.getElementById('lightbox').classList.remove('active');
}

function nextImage() {
    const images = getGalleryImages();
    if (!images.length) {
        return;
    }

    currentImageIndex = (currentImageIndex + 1) % images.length;
    openLightbox(currentImageIndex);
}

function prevImage() {
    const images = getGalleryImages();
    if (!images.length) {
        return;
    }

    currentImageIndex = (currentImageIndex - 1 + images.length) % images.length;
    openLightbox(currentImageIndex);
}

function handleNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('section[id]');

    navLinks.forEach((link) => {
        link.addEventListener('click', (event) => {
            const href = link.getAttribute('href');
            if (!href || !href.startsWith('#')) {
                return;
            }

            event.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                target.scrollIntoView({ behavior: 'smooth' });
            }
        });
    });

    window.addEventListener('scroll', () => {
        let currentSectionId = 'home';

        sections.forEach((section) => {
            if (window.scrollY >= section.offsetTop - 140) {
                currentSectionId = section.id;
            }
        });

        navLinks.forEach((link) => {
            link.classList.toggle('active', link.getAttribute('href') === `#${currentSectionId}`);
        });
    });
}

document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    handleNavigation();

    document.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
    document.querySelector('.lightbox-next').addEventListener('click', nextImage);
    document.querySelector('.lightbox-prev').addEventListener('click', prevImage);

    document.getElementById('lightbox').addEventListener('click', (event) => {
        if (event.target.id === 'lightbox') {
            closeLightbox();
        }
    });

    document.addEventListener('keydown', (event) => {
        const isLightboxOpen = document.getElementById('lightbox').classList.contains('active');
        if (!isLightboxOpen) {
            return;
        }

        if (event.key === 'Escape') closeLightbox();
        if (event.key === 'ArrowRight') nextImage();
        if (event.key === 'ArrowLeft') prevImage();
    });
});
