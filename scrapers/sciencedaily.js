// scrapers/sciencedaily.js - Scraper cho ScienceDaily
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function scrapeScienceDaily(url) {
    try {
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });
        
        const $ = cheerio.load(response.data);
        
        const data = {
            title: '',
            date: '',
            source: '',
            summary: '',
            fullStory: '',
            journalReference: ''
        };
        
        // Lấy tiêu đề
        const h1 = $('h1').first();
        if (h1.length > 0) {
            data.title = h1.text().trim();
        }
        
        // Lấy thông tin từ dd tags
        const ddTags = $('dd');
        if (ddTags.length >= 3) {
            data.date = $(ddTags[0]).text().trim();
            data.source = $(ddTags[1]).text().trim();
            data.summary = $(ddTags[2]).text().trim();
        }
        
        // Lấy toàn bộ nội dung - TÌM "FULL STORY"
        const contentParts = [];
        const fullStoryH2 = $('h2:contains("FULL STORY")');
        
        if (fullStoryH2.length > 0) {
            fullStoryH2.nextAll().each(function() {
                const nodeName = this.tagName ? this.tagName.toLowerCase() : '';
                const nodeClass = $(this).attr('class') || '';
                
                // Dừng nếu gặp phần không liên quan
                if (nodeClass.includes('related') || 
                    nodeClass.includes('source') ||
                    nodeName === 'hr' ||
                    nodeName === 'ul' ||
                    nodeName === 'h2') {
                    return false;
                }
                
                if (nodeName === 'p' || nodeName === 'h3' || nodeName === 'h4') {
                    const text = $(this).text().trim();
                    if (text) {
                        contentParts.push(text);
                    }
                }
            });
        }
        
        // Cách 2: Tìm theo #story_text
        if (contentParts.length === 0) {
            const storyDiv = $('#story_text');
            if (storyDiv.length > 0) {
                storyDiv.find('p, h3, h4').each(function() {
                    const text = $(this).text().trim();
                    if (text && text.length > 10) {
                        contentParts.push(text);
                    }
                });
            }
        }
        
        data.fullStory = contentParts.join('\n\n');
        
        // Lấy tài liệu tham khảo
        const journalRef = $('[class*="journal-reference"]');
        if (journalRef.length > 0) {
            data.journalReference = journalRef.text().trim();
        }
        
        // Làm sạch dữ liệu
        Object.keys(data).forEach(key => {
            if (typeof data[key] === 'string') {
                data[key] = data[key].replace(/\s+/g, ' ').trim();
            }
        });
        
        console.log('✅ ScienceDaily scraper thành công:', {
            hasTitle: !!data.title,
            hasSummary: !!data.summary,
            hasFullStory: !!data.fullStory,
            contentLength: data.fullStory.length
        });
        
        return { success: true, data };
        
    } catch (error) {
        console.error('❌ Lỗi ScienceDaily scraper:', error.message);
        return {
            success: false,
            message: 'Lỗi khi crawl ScienceDaily: ' + error.message
        };
    }
}