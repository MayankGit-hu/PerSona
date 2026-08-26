use std::fs::File;
use std::io::Read;
use std::path::Path;
use zip::ZipArchive;
use quick_xml::events::Event;
use quick_xml::Reader;
use serde_json::Value;

pub fn extract_text<P: AsRef<Path>>(filepath: P) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let path = filepath.as_ref();
    let ext = path.extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase());

    match ext.as_deref() {
        Some("txt") | Some("md") | Some("markdown") => {
            let mut file = File::open(path)?;
            let mut text = String::new();
            file.read_to_string(&mut text)?;
            Ok(text)
        }
        Some("html") | Some("htm") => {
            let mut file = File::open(path)?;
            let mut html_content = String::new();
            file.read_to_string(&mut html_content)?;
            let text = html2text::from_read(html_content.as_bytes(), 80);
            Ok(text)
        }
        Some("pdf") => parse_pdf(path),
        Some("docx") => parse_docx(path),
        Some("xlsx") => parse_xlsx(path),
        Some("json") => parse_json(path),
        _ => Err(format!("Unsupported file extension: {:?}", ext).into()),
    }
}

pub async fn extract_text_from_url(url: &str) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let client = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
        .build()?;
    
    let html = client.get(url)
        .send()
        .await?
        .text()
        .await?;

    let text = html2text::from_read(html.as_bytes(), 80);
    Ok(text)
}

fn parse_pdf(path: &Path) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let bytes = std::fs::read(path)?;
    
    // Attempt pdf_extract safely catching any potential thread panics
    let pdf_extract_res = std::panic::catch_unwind(|| {
        pdf_extract::extract_text_from_mem(&bytes)
    });
    
    match pdf_extract_res {
        Ok(Ok(text)) if !text.trim().is_empty() => {
            println!("parse_pdf: Extracted text successfully using pdf-extract.");
            return Ok(text);
        }
        Ok(Err(e)) => {
            println!("parse_pdf: pdf-extract failed with error: {}. Falling back to lopdf...", e);
        }
        Ok(Ok(_)) => {
            println!("parse_pdf: pdf-extract returned empty text. Falling back to lopdf...");
        }
        Err(_) => {
            println!("parse_pdf: pdf-extract panicked during decoding. Falling back to lopdf...");
        }
    }
    
    // Fallback: lopdf page-by-page text extraction
    let doc = lopdf::Document::load_mem(&bytes)?;
    let mut text = String::new();
    let pages = doc.get_pages();
    for (page_num, _) in pages {
        if let Ok(page_text) = doc.extract_text(&[page_num]) {
            text.push_str(&page_text);
            text.push('\n');
        }
    }
    
    if text.trim().is_empty() {
        return Err("PDF extraction failed: both pdf-extract and lopdf returned empty results.".into());
    }
    
    println!("parse_pdf: Extracted text successfully using lopdf fallback.");
    Ok(text)
}

fn parse_docx(path: &Path) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let file = File::open(path)?;
    let mut archive = ZipArchive::new(file)?;
    
    let mut document_xml = archive.by_name("word/document.xml")?;
    let mut xml_content = String::new();
    document_xml.read_to_string(&mut xml_content)?;
    
    let mut reader = Reader::from_str(&xml_content);
    reader.config_mut().trim_text(true);
    
    let mut text = String::new();
    let mut in_t_tag = false;
    
    loop {
        match reader.read_event() {
            Ok(Event::Start(ref e)) if e.name().as_ref() == b"w:t" => {
                in_t_tag = true;
            }
            Ok(Event::End(ref e)) if e.name().as_ref() == b"w:t" => {
                in_t_tag = false;
            }
            Ok(Event::End(ref e)) if e.name().as_ref() == b"w:p" => {
                text.push('\n');
            }
            Ok(Event::Text(e)) => {
                if in_t_tag {
                    if let Ok(txt) = e.unescape() {
                        text.push_str(&txt);
                    }
                }
            }
            Ok(Event::Eof) => break,
            Err(e) => return Err(Box::new(e)),
            _ => {}
        }
    }
    
    Ok(text)
}

fn parse_xlsx(path: &Path) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    use calamine::{Reader as _, Xlsx, open_workbook, Data};
    
    let mut excel: Xlsx<_> = open_workbook(path)?;
    let mut text = String::new();
    
    for sheet_name in excel.sheet_names() {
        text.push_str(&format!("Sheet: {}\n", sheet_name));
        if let Ok(range) = excel.worksheet_range(&sheet_name) {
            for row in range.rows() {
                let row_str: Vec<String> = row.iter().map(|cell| {
                    match cell {
                        Data::Empty => "".to_string(),
                        Data::String(s) => s.clone(),
                        Data::Float(f) => f.to_string(),
                        Data::Int(i) => i.to_string(),
                        Data::Bool(b) => b.to_string(),
                        Data::DateTime(d) => d.to_string(),
                        Data::DateTimeIso(s) => s.clone(),
                        Data::DurationIso(s) => s.clone(),
                        Data::Error(e) => format!("Error: {:?}", e),
                    }
                }).collect();
                text.push_str(&row_str.join(" | "));
                text.push('\n');
            }
        }
        text.push('\n');
    }
    
    Ok(text)
}

fn parse_json(path: &Path) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let mut file = File::open(path)?;
    let mut json_content = String::new();
    file.read_to_string(&mut json_content)?;
    
    let value: Value = serde_json::from_str(&json_content)?;
    
    if value.get("openapi").is_some() || value.get("swagger").is_some() {
        return parse_openapi_spec(value);
    }
    
    if value.get("info").and_then(|i| i.get("schema")).and_then(|s| s.as_str()).map_or(false, |s| s.contains("postman")) {
        return parse_postman_collection(value);
    }
    
    let pretty = serde_json::to_string_pretty(&value)?;
    Ok(pretty)
}

fn parse_openapi_spec(value: Value) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let mut text = String::new();
    let title = value.get("info").and_then(|i| i.get("title")).and_then(|t| t.as_str()).unwrap_or("OpenAPI API Spec");
    let version = value.get("info").and_then(|i| i.get("version")).and_then(|v| v.as_str()).unwrap_or("1.0.0");
    let description = value.get("info").and_then(|i| i.get("description")).and_then(|d| d.as_str()).unwrap_or("");
    
    text.push_str(&format!("API Specification: {}\nVersion: {}\nDescription: {}\n\n", title, version, description));
    
    if let Some(paths) = value.get("paths").and_then(|p| p.as_object()) {
        for (path, methods_val) in paths {
            if let Some(methods) = methods_val.as_object() {
                for (method, op_val) in methods {
                    let summary = op_val.get("summary").and_then(|s| s.as_str()).unwrap_or("");
                    let desc = op_val.get("description").and_then(|d| d.as_str()).unwrap_or("");
                    text.push_str(&format!("Endpoint: {} {}\n", method.to_uppercase(), path));
                    if !summary.is_empty() {
                        text.push_str(&format!("Summary: {}\n", summary));
                    }
                    if !desc.is_empty() {
                        text.push_str(&format!("Description: {}\n", desc));
                    }
                    
                    if let Some(params) = op_val.get("parameters").and_then(|p| p.as_array()) {
                        if !params.is_empty() {
                            text.push_str("Parameters:\n");
                            for param in params {
                                let name = param.get("name").and_then(|n| n.as_str()).unwrap_or("");
                                let in_loc = param.get("in").and_then(|i| i.as_str()).unwrap_or("");
                                let required = param.get("required").and_then(|r| r.as_bool()).unwrap_or(false);
                                let schema_type = param.get("schema").and_then(|s| s.get("type")).and_then(|t| t.as_str()).unwrap_or("");
                                text.push_str(&format!("  - {} ({}, required: {}, type: {})\n", name, in_loc, required, schema_type));
                            }
                        }
                    }
                    text.push_str("----------------------------------------\n");
                }
            }
        }
    }
    
    Ok(text)
}

fn parse_postman_collection(value: Value) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
    let mut text = String::new();
    let name = value.get("info").and_then(|i| i.get("name")).and_then(|n| n.as_str()).unwrap_or("Postman Collection");
    let desc = value.get("info").and_then(|i| i.get("description")).and_then(|d| d.as_str()).unwrap_or("");
    
    text.push_str(&format!("Postman Collection: {}\nDescription: {}\n\n", name, desc));
    
    if let Some(items) = value.get("item").and_then(|i| i.as_array()) {
        walk_postman_items(items, "", &mut text);
    }
    
    Ok(text)
}

fn walk_postman_items(items: &[Value], parent_folder: &str, text: &mut String) {
    for item in items {
        let name = item.get("name").and_then(|n| n.as_str()).unwrap_or("");
        
        if let Some(sub_items) = item.get("item").and_then(|i| i.as_array()) {
            let folder_path = if parent_folder.is_empty() {
                name.to_string()
            } else {
                format!("{}/{}", parent_folder, name)
            };
            walk_postman_items(sub_items, &folder_path, text);
        } else if let Some(req_val) = item.get("request") {
            let method = req_val.get("method").and_then(|m| m.as_str()).unwrap_or("GET");
            let url = if let Some(url_obj) = req_val.get("url") {
                if let Some(raw_url) = url_obj.get("raw").and_then(|r| r.as_str()) {
                    raw_url.to_string()
                } else if let Some(url_str) = url_obj.as_str() {
                    url_str.to_string()
                } else {
                    "".to_string()
                }
            } else {
                "".to_string()
            };
            let desc = req_val.get("description").and_then(|d| d.as_str()).unwrap_or("");
            
            text.push_str(&format!("API Request [{}]: {}\n", parent_folder, name));
            text.push_str(&format!("Method: {}\nURL: {}\n", method, url));
            if !desc.is_empty() {
                text.push_str(&format!("Description: {}\n", desc));
            }
            text.push_str("----------------------------------------\n");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn test_parse_openapi_json() {
        let openapi_content = r#"{
            "openapi": "3.0.0",
            "info": {
                "title": "Test API",
                "version": "1.0.0",
                "description": "A mock api for testing"
            },
            "paths": {
                "/users": {
                    "get": {
                        "summary": "List users",
                        "description": "Retrieve list of all users",
                        "parameters": [
                            {
                                "name": "limit",
                                "in": "query",
                                "required": false,
                                "schema": {
                                    "type": "integer"
                                }
                            }
                        ]
                    }
                }
            }
        }"#;

        let temp_dir = std::env::temp_dir();
        let filepath = temp_dir.join("openapi_test.json");
        let mut file = File::create(&filepath).unwrap();
        file.write_all(openapi_content.as_bytes()).unwrap();
        drop(file);

        let parsed_text = parse_json(&filepath).unwrap();
        assert!(parsed_text.contains("API Specification: Test API"));
        assert!(parsed_text.contains("Endpoint: GET /users"));
        assert!(parsed_text.contains("Summary: List users"));
        assert!(parsed_text.contains("- limit (query, required: false, type: integer)"));

        let _ = std::fs::remove_file(filepath);
    }

    #[test]
    fn test_parse_markdown_file() {
        let md_content = "# Hello World\nThis is a *markdown* document.";
        let temp_dir = std::env::temp_dir();
        let filepath = temp_dir.join("test_doc.markdown");
        
        let mut file = File::create(&filepath).unwrap();
        file.write_all(md_content.as_bytes()).unwrap();
        drop(file);

        let parsed_text = extract_text(&filepath).unwrap();
        assert_eq!(parsed_text, md_content);

        let _ = std::fs::remove_file(filepath);
    }

    #[test]
    fn test_parse_html_file() {
        let html_content = "<html><body><h1>Page Title</h1><p>Welcome to <strong>PerSona</strong> local-first AI.</p></body></html>";
        let temp_dir = std::env::temp_dir();
        let filepath = temp_dir.join("test_doc.html");
        
        let mut file = File::create(&filepath).unwrap();
        file.write_all(html_content.as_bytes()).unwrap();
        drop(file);

        let parsed_text = extract_text(&filepath).unwrap();
        // html2text parses h1 as header formatting and paragraphs cleanly
        assert!(parsed_text.contains("Page Title"));
        assert!(parsed_text.contains("Welcome to"));
        assert!(parsed_text.contains("PerSona"));
        assert!(parsed_text.contains("local-first AI"));

        let _ = std::fs::remove_file(filepath);
    }
}

