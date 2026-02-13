// scrapers.js - ROUTER chọn scraper phù hợp
import { scrapeMedRxiv } from './scrapers/medrxiv.js';
import { scrapePMC } from './scrapers/pmc.js';
import { scrapeScienceDaily } from './scrapers/sciencedaily.js';

/**
 * Phát hiện loại link và chọn scraper tương ứng
 */
function detectSource(url) {
    const urlLower = url.toLowerCase();
    
    // medRxiv
    if (urlLower.includes('medrxiv.org')) {
        return 'medrxiv';
    }
    
    // PubMed Central (PMC)
    if (urlLower.includes('pmc.ncbi.nlm.nih.gov') || /^PMC\d+$/i.test(url)) {
        return 'pmc';
    }
    
    // ScienceDaily
    if (urlLower.includes('sciencedaily.com')) {
        return 'sciencedaily';
    }
    
    // Thêm các nguồn khác ở đây trong tương lai:
    // if (urlLower.includes('pubmed.ncbi.nlm.nih.gov')) return 'pubmed';
    // if (urlLower.includes('biorxiv.org')) return 'biorxiv';
    // if (urlLower.includes('nature.com')) return 'nature';
    
    return 'unknown';
}

/**
 * HÀM CHÍNH - Gọi scraper phù hợp
 */
export async function scrapeArticle(url) {
    const source = detectSource(url);
    
    console.log(`🎯 Phát hiện nguồn: ${source}`);
    
    switch (source) {
        case 'medrxiv':
            return await scrapeMedRxiv(url);
            
        case 'pmc':
            return await scrapePMC(url);
            
        case 'sciencedaily':
            return await scrapeScienceDaily(url);
            
        case 'unknown':
            return {
                success: false,
                message: 'Nguồn này chưa được hỗ trợ. Vui lòng sử dụng link từ medRxiv, PMC, hoặc ScienceDaily.'
            };
            
        default:
            return {
                success: false,
                message: 'Không thể xác định nguồn bài viết'
            };
    }
}

/**
 * Danh sách các nguồn được hỗ trợ
 */
export function getSupportedSources() {
    return [
        { name: 'medRxiv', pattern: 'medrxiv.org', example: 'https://www.medrxiv.org/content/...' },
        { name: 'PubMed Central', pattern: 'pmc.ncbi.nlm.nih.gov hoặc PMC ID', example: 'PMC4924471' },
        { name: 'ScienceDaily', pattern: 'sciencedaily.com', example: 'https://www.sciencedaily.com/releases/...' }
    ];
}