// scrapers/pmc.js - Scraper cho PubMed Central
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function scrapePMC(url) {
    try {
        let finalUrl = url;
        let pmcId = '';
        
        if (/^PMC\d+$/i.test(url)) {
            pmcId = url.toUpperCase();
            finalUrl = `https://pmc.ncbi.nlm.nih.gov/articles/${pmcId}/`;
        } else if (url.match(/PMC\d+/i)) {
            pmcId = url.match(/PMC\d+/i)[0].toUpperCase();
        }
        
        const response = await axios.get(finalUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        
        const data = {
            title: '',
            authors: '',
            journal: '',
            year: '',
            pmcId: pmcId,
            pmid: '',
            doi: '',
            abstract: '',
            keywords: '',
            fullText: '',
            references: '',
            url: finalUrl
        };
        
        // Lấy tiêu đề
        data.title = $('meta[name="citation_title"]').attr('content') || 
                     $('h1.content-title').text().trim() ||
                     $('h1[class*="article-title"]').text().trim();
        
        // Lấy tác giả
        const authorsList = [];
        $('meta[name="citation_author"]').each((i, el) => {
            authorsList.push($(el).attr('content'));
        });
        data.authors = authorsList.join(', ');
        
        // Lấy tạp chí
        data.journal = $('meta[name="citation_journal_title"]').attr('content') || '';
        
        // Lấy năm
        const pubDate = $('meta[name="citation_publication_date"]').attr('content') || '';
        if (pubDate) {
            data.year = new Date(pubDate).getFullYear().toString();
        }
        
        // Lấy PMID và DOI
        data.pmid = $('meta[name="citation_pmid"]').attr('content') || '';
        data.doi = $('meta[name="citation_doi"]').attr('content') || '';
        
        // Lấy tóm tắt
        const abstractParts = [];
        $('.abstract p, section[class*="abstract"] p, section#abstract p, div#abstract p').each((i, el) => {
            const text = $(el).text().trim();
            if (text && text.length > 20) {
                abstractParts.push(text);
            }
        });
        data.abstract = abstractParts.length > 0 ? 
            abstractParts.join('\n\n') : 
            'Bài viết này không có phần tóm tắt';
        
        // Lấy từ khóa
        const keywordsList = [];
        $('.kwd-group span, meta[name="citation_keywords"]').each((i, el) => {
            const keyword = $(el).attr('content') || $(el).text().trim();
            if (keyword && keyword.length > 1 && keyword !== ',' && keyword !== ';') {
                keywordsList.push(keyword);
            }
        });
        data.keywords = keywordsList.length > 0 ? 
            [...new Set(keywordsList)].join(', ') : 
            'Không có từ khóa';
        
        // Lấy toàn văn
        const fullTextParts = [];
        const seenContent = new Set();
        
        $('.tsec, section[id], .boxed-text').each((i, section) => {
            const sectionId = $(section).attr('id') || '';
            const sectionClass = $(section).attr('class') || '';
            
            if (sectionId.includes('abstract') || 
                sectionId.includes('reference') || 
                sectionClass.includes('ref-list')) {
                return;
            }
            
            const heading = $(section).find('h2, h3').first().text().trim().toLowerCase();
            if (heading && !heading.includes('reference')) {
                if (!seenContent.has(heading)) {
                    fullTextParts.push('\n### ' + $(section).find('h2, h3').first().text().trim() + ' ###\n');
                    seenContent.add(heading);
                }
            }
            
            $(section).find('p').each((j, p) => {
                const text = $(p).text().trim();
                const textHash = text.substring(0, 100);
                
                if (text && text.length > 20 && !seenContent.has(textHash) &&
                    !text.match(/\[DOI\]|\[PubMed\]/i)) {
                    fullTextParts.push(text);
                    seenContent.add(textHash);
                }
            });
        });
        
        data.fullText = fullTextParts.length > 0 ? 
            fullTextParts.join('\n\n') : 
            'Không thể trích xuất nội dung toàn văn';
        
        // Làm sạch dữ liệu
        Object.keys(data).forEach(key => {
            if (typeof data[key] === 'string') {
                data[key] = data[key].replace(/\s+/g, ' ')
                                     .replace(/[\x00-\x1F\x7F]/g, '')
                                     .trim();
            }
        });
        
        if (!data.title) {
            throw new Error('Không thể trích xuất dữ liệu từ PMC');
        }
        
        console.log('✅ PMC scraper thành công');
        return { success: true, data };
        
    } catch (error) {
        console.error('❌ Lỗi PMC scraper:', error.message);
        return {
            success: false,
            message: 'Lỗi khi crawl PMC: ' + error.message
        };
    }
}