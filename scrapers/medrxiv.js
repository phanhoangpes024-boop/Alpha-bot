// scrapers/medrxiv.js - Scraper cho medRxiv (SỬ DỤNG ZENROWS)
import axios from 'axios';
import * as cheerio from 'cheerio';

export async function scrapeMedRxiv(url) {
    try {
        // Tạo URL tóm tắt và toàn văn
        let abstractUrl = url;
        let fullTextUrl = url;

        if (!url.includes('.full-text')) {
            fullTextUrl = url + '.full-text';
        } else {
            abstractUrl = url.replace('.full-text', '');
        }

        // ===== SỬ DỤNG ZENROWS API =====
        const zenrowsApiKey = process.env.ZENROWS_API_KEY;

        if (!zenrowsApiKey) {
            throw new Error('ZENROWS_API_KEY chưa được cấu hình trong .env');
        }

        console.log('🔧 Sử dụng ZenRows API để crawl medRxiv...');

        // Lấy nội dung tóm tắt qua ZenRows
        const zenrowsAbstractUrl = `https://api.zenrows.com/v1/?url=${encodeURIComponent(abstractUrl)}&apikey=${zenrowsApiKey}&js_render=true`;

        const abstractResponse = await axios.get(zenrowsAbstractUrl);

        const $ = cheerio.load(abstractResponse.data);

        const data = {
            title: '',
            authors: '',
            doi: '',
            date: '',
            abstract: '',
            fullText: '',
            keywords: '',
            pdfUrl: '',
            abstractUrl: abstractUrl,
            fullTextUrl: fullTextUrl
        };

        // Lấy tiêu đề
        data.title = $('#page-title').text().trim();

        // Lấy tác giả
        const authorsList = [];
        $('meta[name="citation_author"]').each((i, el) => {
            authorsList.push($(el).attr('content'));
        });
        if (authorsList.length === 0) {
            const authorsSpan = $('.highwire-citation-authors').text().trim();
            if (authorsSpan) {
                data.authors = authorsSpan;
            }
        } else {
            data.authors = authorsList.join(', ');
        }

        // Lấy DOI
        data.doi = $('meta[name="citation_doi"]').attr('content') || '';

        // Lấy ngày
        data.date = $('meta[name="citation_publication_date"]').attr('content') ||
            $('meta[name="citation_online_date"]').attr('content') || '';

        // Lấy tóm tắt (Abstract)
        const abstractParts = [];
        $('.section.abstract p').each((i, el) => {
            const text = $(el).text().trim();
            if (text) {
                abstractParts.push(text);
            }
        });

        if (abstractParts.length === 0) {
            $('div[class*="abstract"] p').each((i, el) => {
                const text = $(el).text().trim();
                if (text && text.length > 20) {
                    abstractParts.push(text);
                }
            });
        }

        data.abstract = abstractParts.join('\n\n');

        // Lấy từ khóa
        const keywordsList = [];
        $('meta[name="citation_keywords"]').each((i, el) => {
            keywordsList.push($(el).attr('content'));
        });
        data.keywords = keywordsList.join(', ');

        // Lấy PDF URL
        data.pdfUrl = $('meta[name="citation_pdf_url"]').attr('content') || '';

        // Lấy toàn văn (Full Text) qua ZenRows
        try {
            const zenrowsFullTextUrl = `https://api.zenrows.com/v1/?url=${encodeURIComponent(fullTextUrl)}&apikey=${zenrowsApiKey}&js_render=true`;

            const fullTextResponse = await axios.get(zenrowsFullTextUrl);

            const $full = cheerio.load(fullTextResponse.data);
            const fullTextParts = [];

            $full('.section').each((i, section) => {
                const sectionTitle = $full(section).find('h2, h3').first().text().trim();
                if (sectionTitle) {
                    fullTextParts.push('\n## ' + sectionTitle + '\n');
                }

                $full(section).find('p').each((j, p) => {
                    const text = $full(p).text().trim();
                    if (text && text.length > 20) {
                        fullTextParts.push(text);
                    }
                });
            });

            data.fullText = fullTextParts.join('\n\n');

            if (!data.fullText) {
                const bodyParts = [];
                $full('.article.fulltext-view p').each((i, p) => {
                    const text = $full(p).text().trim();
                    if (text && text.length > 20) {
                        bodyParts.push(text);
                    }
                });
                data.fullText = bodyParts.join('\n\n');
            }
        } catch (fullTextError) {
            console.log('⚠️ Không lấy được toàn văn medRxiv, chỉ dùng tóm tắt');
            data.fullText = data.abstract;
        }

        // Làm sạch dữ liệu
        Object.keys(data).forEach(key => {
            if (typeof data[key] === 'string') {
                data[key] = data[key].replace(/\s+/g, ' ').trim();
            }
        });

        console.log('✅ medRxiv scraper (ZenRows) thành công');
        return { success: true, data };

    } catch (error) {
        console.error('❌ Lỗi medRxiv scraper:', error.message);
        return {
            success: false,
            message: 'Lỗi khi crawl medRxiv: ' + error.message
        };
    }
}