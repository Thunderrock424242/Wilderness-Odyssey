// Load configuration and populate the website
let config = {};
let currentImageIndex = 0;

// Load config.json
async function loadConfig() {
    try {
        const response = await fetch('config.json');
        config = await response.json();
        populateWebsite();
        applyTheme();
    } catch (error) {
        console.error('Error loading config:', error);
        // Use default values if config fails to load
        populateWebsite();
    }
}

// Populate website with config data
function populateWebsite() {
    // Update page title and meta
    document.getElementById('page-title').textContent = config.modpack?.name || 'Modpack';
    document.getElementById('nav-logo').textContent = config.modpack?.name || 'Modpack';
    
    // Update hero section
    document.getElementById('hero-title').textContent = config.modpack?.name || 'Your Modpack Name';
    document.getElementById('hero-tagline').textContent = config.modpack?.tagline || 'An Epic Adventure Awaits';
    document.getElementById('hero-description').textContent = config.modpack?.description || 'Loading...';
    document.getElementById('mc-version').textContent = config.modpack?.minecraftVersion || '1.20.1';
    document.getElementById('pack-version').textContent = config.modpack?.version || '1.0.0';
    
    // Update links
    const curseforgeUrl = config.links?.curseforge || '#';
    const githubUrl = config.links?.github ? `https://github.com/${config.links.github}` : '#';
    const discordUrl = config.links?.discord || '#';
    
    document.getElementById('hero-download').href = curseforgeUrl;
    document.getElementById('download-btn').href = curseforgeUrl;
    document.getElementById('github-link').href = githubUrl;
    document.getElementById('github-wiki-link').href = githubUrl;
    
    // Update Discord link
    const discordLink = document.getElementById('discord-link');
    if (discordUrl && discordUrl !== '#') {
        discordLink.href = discordUrl;
        discordLink.style.display = 'inline-block';
    } else {
        discordLink.style.display = 'none';
    }
    
    // Populate features
    populateFeatures();
    
    // Populate gallery
    populateGallery();
    
    // Populate wiki categories
    populateWikiCategories();
}

// Populate features section
function populateFeatures() {
    const featuresGrid = document.getElementById('features-grid');
    featuresGrid.innerHTML = '';
    
    const features = config.features || [
        {
            title: 'Epic Exploration',
            description: 'Discover dozens of new biomes, structures, and dimensions to explore',
            icon: '🗺️'
        },
        {
            title: 'Challenging Combat',
            description: 'Face powerful bosses and enhanced mobs with new weapons and armor',
            icon: '⚔️'
        },
        {
            title: 'Quest System',
            description: 'Follow guided questlines that lead you through the adventure',
            icon: '📜'
        },
        {
            title: 'Balanced Progression',
            description: 'Carefully tuned gameplay that rewards exploration and skill',
            icon: '⭐'
        }
    ];
    
    features.forEach(feature => {
        const card = document.createElement('div');
        card.className = 'feature-card';
        card.innerHTML = `
            <span class="feature-icon">${feature.icon}</span>
            <h3>${feature.title}</h3>
            <p>${feature.description}</p>
        `;
        featuresGrid.appendChild(card);
    });
}

// Populate gallery section
function populateGallery() {
    const galleryGrid = document.getElementById('gallery-grid');
    galleryGrid.innerHTML = '';
    
    const images = config.gallery?.images || [
        {
            url: 'https://via.placeholder.com/800x450/1c1917/fbbf24?text=Screenshot+1',
            title: 'Add Your Screenshots',
            description: 'Edit config.json to add your images'
        },
        {
            url: 'https://via.placeholder.com/800x450/1c1917/fbbf24?text=Screenshot+2',
            title: 'Epic Moments',
            description: 'Showcase your modpack'
        },
        {
            url: 'https://via.placeholder.com/800x450/1c1917/fbbf24?text=Screenshot+3',
            title: 'Beautiful Scenes',
            description: 'Capture amazing landscapes'
        },
        {
            url: 'https://via.placeholder.com/800x450/1c1917/fbbf24?text=Screenshot+4',
            title: 'Adventures',
            description: 'Share your journey'
        }
    ];
    
    images.forEach((image, index) => {
        const item = document.createElement('div');
        item.className = 'gallery-item';
        item.innerHTML = `
            <img src="${image.url}" alt="${image.title}" loading="lazy">
            <div class="gallery-overlay">
                <h3>${image.title}</h3>
                <p>${image.description}</p>
            </div>
        `;
        item.addEventListener('click', () => openLightbox(index));
        galleryGrid.appendChild(item);
    });
}

// Populate wiki categories
function populateWikiCategories() {
    const wikiCategories = document.getElementById('wiki-categories');
    wikiCategories.innerHTML = '';
    
    const categories = config.wiki?.categories || [
        'Getting Started',
        'Mods List',
        'Progression Guide',
        'Dimensions',
        'Bosses',
        'FAQ'
    ];
    
    const githubRepo = config.links?.github || 'yourusername/modpack-wiki';
    const branch = config.wiki?.branch || 'main';
    
    categories.forEach(category => {
        const categorySlug = category.toLowerCase().replace(/\s+/g, '-');
        const link = document.createElement('a');
        link.className = 'wiki-category';
        link.href = `https://github.com/${githubRepo}/blob/${branch}/wiki/${categorySlug}.md`;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = category;
        wikiCategories.appendChild(link);
    });
}

// Apply theme colors from config
function applyTheme() {
    if (config.theme) {
        const root = document.documentElement;
        if (config.theme.primaryColor) root.style.setProperty('--primary-color', config.theme.primaryColor);
        if (config.theme.secondaryColor) root.style.setProperty('--secondary-color', config.theme.secondaryColor);
        if (config.theme.accentColor) root.style.setProperty('--accent-color', config.theme.accentColor);
        if (config.theme.backgroundColor) root.style.setProperty('--bg-color', config.theme.backgroundColor);
        if (config.theme.textColor) root.style.setProperty('--text-color', config.theme.textColor);
    }
}

// Lightbox functionality
function openLightbox(index) {
    const images = config.gallery?.images || [];
    if (images.length === 0) return;
    
    currentImageIndex = index;
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxCaption = document.getElementById('lightbox-caption');
    
    lightboxImg.src = images[currentImageIndex].url;
    lightboxImg.alt = images[currentImageIndex].title;
    lightboxCaption.innerHTML = `
        <h3>${images[currentImageIndex].title}</h3>
        <p>${images[currentImageIndex].description}</p>
    `;
    
    lightbox.classList.add('active');
}

function closeLightbox() {
    document.getElementById('lightbox').classList.remove('active');
}

function nextImage() {
    const images = config.gallery?.images || [];
    currentImageIndex = (currentImageIndex + 1) % images.length;
    openLightbox(currentImageIndex);
}

function prevImage() {
    const images = config.gallery?.images || [];
    currentImageIndex = (currentImageIndex - 1 + images.length) % images.length;
    openLightbox(currentImageIndex);
}

// Navigation handling
function handleNavigation() {
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('section[id]');
    
    // Smooth scroll for navigation links
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const href = link.getAttribute('href');
            if (href && href.startsWith('#')) {
                e.preventDefault();
                const target = document.querySelector(href);
                if (target) {
                    target.scrollIntoView({ behavior: 'smooth' });
                    
                    // Update active link
                    navLinks.forEach(l => l.classList.remove('active'));
                    link.classList.add('active');
                }
            }
        });
    });
    
    // Update active nav on scroll
    window.addEventListener('scroll', () => {
        let current = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop;
            const sectionHeight = section.clientHeight;
            if (window.pageYOffset >= sectionTop - 100) {
                current = section.getAttribute('id');
            }
        });
        
        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href') === `#${current}`) {
                link.classList.add('active');
            }
        });
    });
}

// Event listeners
document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    handleNavigation();
    
    // Lightbox controls
    document.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
    document.querySelector('.lightbox-next').addEventListener('click', nextImage);
    document.querySelector('.lightbox-prev').addEventListener('click', prevImage);
    
    // Close lightbox on background click
    document.getElementById('lightbox').addEventListener('click', (e) => {
        if (e.target.id === 'lightbox') {
            closeLightbox();
        }
    });
    
    // Keyboard navigation for lightbox
    document.addEventListener('keydown', (e) => {
        const lightbox = document.getElementById('lightbox');
        if (lightbox.classList.contains('active')) {
            if (e.key === 'Escape') closeLightbox();
            if (e.key === 'ArrowRight') nextImage();
            if (e.key === 'ArrowLeft') prevImage();
        }
    });
});
