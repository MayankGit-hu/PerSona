use std::path::{Path, PathBuf};
use serde_json::Value;

/// A skill loaded from disk. Corresponds to one folder under the skills directory.
/// The `input_schema` field holds a full MCP-compatible JSON Schema object.
#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Skill {
    pub name: String,
    pub description: String,
    /// MCP-compatible inputSchema: { type, properties, required }
    pub input_schema: Value,
    /// Absolute path to the handler script (handler.js / handler.py)
    pub handler_path: String,
    pub language: String,
    pub approved: bool,
    pub created_at: String,
    pub last_used_at: Option<String>,
    pub code: String,
}

pub struct SkillRegistry {
    skills_dir: PathBuf,
}

impl SkillRegistry {
    pub fn new(app_data_dir: PathBuf) -> Self {
        let skills_dir = app_data_dir.join("skills");
        let _ = std::fs::create_dir_all(&skills_dir);
        Self { skills_dir }
    }

    pub fn get_skills_dir(&self) -> PathBuf {
        self.skills_dir.clone()
    }

    /// List all skills by scanning subfolders. Each subfolder must contain a
    /// `tool.json` (MCP schema) and a `handler.js` or `handler.py`.
    pub fn list_skills(&self) -> Result<Vec<Skill>, Box<dyn std::error::Error + Send + Sync>> {
        let mut list = Vec::new();
        if self.skills_dir.exists() {
            for entry in std::fs::read_dir(&self.skills_dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_dir() {
                    if let Some(skill) = load_skill_folder(&path) {
                        list.push(skill);
                    }
                }
            }
        }
        
        // Add built-in web_search skill
        list.push(Skill {
            name: "web_search".to_string(),
            description: "Search the web for up-to-date information, news, or facts.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "The search query to look up on the internet."
                    }
                },
                "required": ["query"]
            }),
            handler_path: "built-in-rust".to_string(),
            language: "rust".to_string(),
            approved: true,
            created_at: chrono::Utc::now().to_rfc3339(),
            last_used_at: None,
            code: "built-in".to_string(),
        });
        
        // Add built-in read_webpage skill
        list.push(Skill {
            name: "read_webpage".to_string(),
            description: "Read the text content of a webpage given its URL. Useful when a web search snippet doesn't contain the full answer.".to_string(),
            input_schema: serde_json::json!({
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "The URL of the webpage to read."
                    }
                },
                "required": ["url"]
            }),
            handler_path: "built-in-rust".to_string(),
            language: "rust".to_string(),
            approved: true,
            created_at: chrono::Utc::now().to_rfc3339(),
            last_used_at: None,
            code: "built-in".to_string(),
        });
        
        Ok(list)
    }

    /// Delete a skill from the registry by its name.
    /// This permanently removes the skill folder from disk.
    pub fn delete_skill(&self, skill_name: &str) -> Result<(), String> {
        // Find the skill to ensure it exists
        let skills = match self.list_skills() {
            Ok(s) => s,
            Err(e) => return Err(e.to_string()),
        };
        let target = match skills.into_iter().find(|s| s.name == skill_name) {
            Some(s) => s,
            None => return Err(format!("Skill '{}' not found in registry", skill_name)),
        };

        // Prevent deletion of built-in native skills
        if target.language == "rust" && target.handler_path == "built-in-rust" {
            return Err("Cannot delete built-in native skills".into());
        }

        // Delete the skill folder
        let skill_dir = self.skills_dir.join(skill_name);
        if skill_dir.exists() {
            std::fs::remove_dir_all(&skill_dir)
                .map_err(|e| format!("Failed to delete skill directory: {}", e))?;
        }

        Ok(())
    }

    /// Execute the handler script for a named skill, passing `args` as a
    /// JSON-serialised first argument.
    pub async fn execute_skill(
        &self,
        skill_name: &str,
        args: &Value,
        db: std::sync::Arc<crate::db::Database>,
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let skills = self.list_skills()?;
        let target = skills
            .into_iter()
            .find(|s| s.name == skill_name)
            .ok_or(format!("Skill '{}' not found in registry", skill_name))?;

        if !target.approved {
            return Err("Execution blocked: This skill is pending user approval. Ask the user to approve it in the Skill Library UI.".into());
        }

        let args_str = serde_json::to_string(args)?;

        let res = match target.language.as_str() {
            "rust" => {
                if target.name == "web_search" {
                    let query = args.get("query").and_then(|v| v.as_str()).unwrap_or("");
                    Ok(Self::native_web_search(query, db).await)
                } else if target.name == "read_webpage" {
                    let url = args.get("url").and_then(|v| v.as_str()).unwrap_or("");
                    Ok(Self::native_read_webpage(url).await)
                } else {
                    Err("Unknown native skill".into())
                }
            }
            "javascript" => {
                // Warning: This blocks the tokio runtime momentarily, but it's fine for simple scripts
                let mut cmd = std::process::Command::new("node");
                cmd.arg(&target.handler_path).arg(&args_str);
                let output = cmd.output()?;
                if output.status.success() {
                    Ok(String::from_utf8(output.stdout)?)
                } else {
                    Err(format!(
                        "JS handler error: {}",
                        String::from_utf8(output.stderr)?
                    ).into())
                }
            }
            _ => Err("Unsupported skill runtime. Only JavaScript (Node.js) and rust are supported.".into()),
        };

        if res.is_ok() {
            let skill_dir = self.skills_dir.join(skill_name);
            let tool_path = skill_dir.join("tool.json");
            if tool_path.exists() {
                if let Ok(raw) = std::fs::read_to_string(&tool_path) {
                    if let Ok(mut tool_val) = serde_json::from_str::<Value>(&raw) {
                        if let Some(obj) = tool_val.as_object_mut() {
                            obj.insert("last_used_at".to_string(), Value::String(chrono::Utc::now().to_rfc3339()));
                            if let Ok(file) = std::fs::File::create(&tool_path) {
                                let _ = serde_json::to_writer_pretty(file, &tool_val);
                            }
                        }
                    }
                }
            }
        }

        res
    }

    async fn native_web_search(query: &str, db: std::sync::Arc<crate::db::Database>) -> String {
        // Try Serper API first
        if let Ok(Some(serper_key)) = db.get_setting("serper_api_key") {
            if !serper_key.trim().is_empty() {
                let client = reqwest::Client::new();
                let request_body = serde_json::json!({ "q": query });
                if let Ok(res) = client
                    .post("https://google.serper.dev/search")
                    .header("X-API-KEY", serper_key)
                    .header("Content-Type", "application/json")
                    .json(&request_body)
                    .send()
                    .await 
                {
                    if let Ok(data) = res.json::<serde_json::Value>().await {
                        let mut results = Vec::new();
                        if let Some(organic) = data.get("organic").and_then(|v| v.as_array()) {
                            for item in organic.iter().take(5) {
                                let title = item.get("title").and_then(|v| v.as_str()).unwrap_or("");
                                let link = item.get("link").and_then(|v| v.as_str()).unwrap_or("");
                                let snippet = item.get("snippet").and_then(|v| v.as_str()).unwrap_or("");
                                results.push(format!("- [{}]({})\n  {}", title, link, snippet));
                            }
                        }
                        if !results.is_empty() {
                            return results.join("\n\n");
                        }
                    }
                }
                // Fallback to DuckDuckGo if Serper fails or returns no results
            }
        }


        // Simple URL encoding without dependencies
        let mut encoded_query = String::with_capacity(query.len());
        for b in query.as_bytes() {
            match *b {
                b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                    encoded_query.push(*b as char);
                }
                b' ' => encoded_query.push('+'),
                _ => {
                    encoded_query.push_str(&format!("%{:02X}", b));
                }
            }
        }

        let url = format!("https://html.duckduckgo.com/html/?q={}", encoded_query);
        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
            .build()
            .unwrap_or_default();
            
        let res = match client.get(&url).send().await {
            Ok(resp) => resp,
            Err(e) => return format!("Failed to fetch search results: {}", e),
        };
        
        let html = match res.text().await {
            Ok(t) => t,
            Err(e) => return format!("Failed to read search results: {}", e),
        };

        fn extract_between<'a>(text: &'a str, start: &str, end: &str) -> Option<&'a str> {
            let s_idx = text.find(start)?;
            let offset = s_idx + start.len();
            let e_idx = text[offset..].find(end)?;
            Some(&text[offset..offset + e_idx])
        }

        fn strip_html_tags(html: &str) -> String {
            let mut result = String::with_capacity(html.len());
            let mut in_tag = false;
            for c in html.chars() {
                if c == '<' {
                    in_tag = true;
                } else if c == '>' {
                    in_tag = false;
                } else if !in_tag {
                    result.push(c);
                }
            }
            result.replace("&quot;", "\"")
                  .replace("&amp;", "&")
                  .replace("&#39;", "'")
                  .replace("&lt;", "<")
                  .replace("&gt;", ">")
                  .trim()
                  .to_string()
        }
        
        let mut results = Vec::new();
        let blocks: Vec<&str> = html.split("class=\"result ").collect();
        
        for block in blocks.iter().skip(1).take(5) { // Skip the first chunk, take up to 5 results
            let title = if let Some(a_tag) = extract_between(block, "class=\"result__a\"", "</a>") {
                if let Some(idx) = a_tag.find('>') {
                    strip_html_tags(&a_tag[idx + 1..])
                } else {
                    String::new()
                }
            } else { String::new() };

            let mut link = String::new();
            if let Some(href) = extract_between(block, "class=\"result__url\" href=\"", "\"") {
                let raw_link = href;
                if raw_link.starts_with("//") {
                    link = format!("https:{}", raw_link);
                } else if raw_link.contains("uddg=") {
                    // Extract real URL from duckduckgo redirect
                    let full_url = if raw_link.starts_with("http") { 
                        raw_link.to_string() 
                    } else { 
                        format!("https://duckduckgo.com{}", raw_link) 
                    };
                    if let Ok(parsed_url) = reqwest::Url::parse(&full_url) {
                        for (k, v) in parsed_url.query_pairs() {
                            if k == "uddg" {
                                link = v.into_owned();
                                break;
                            }
                        }
                    }
                    if link.is_empty() {
                        link = raw_link.to_string();
                    }
                } else {
                    link = raw_link.to_string();
                }
            }
            
            let snippet = if let Some(a_tag) = extract_between(block, "class=\"result__snippet", "</a>") {
                if let Some(idx) = a_tag.find('>') {
                    strip_html_tags(&a_tag[idx + 1..])
                } else {
                    String::new()
                }
            } else { String::new() };
            
            if !title.is_empty() && !link.is_empty() {
                results.push(format!("Title: {}\nURL: {}\nSnippet: {}", title, link, snippet));
            }
        }
        
        if results.is_empty() {
            "No results found.".to_string()
        } else {
            results.join("\n\n")
        }
    }

    async fn native_read_webpage(url: &str) -> String {
        let client = reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
            .build()
            .unwrap_or_default();
            
        let res = match client.get(url).send().await {
            Ok(resp) => resp,
            Err(e) => return format!("Failed to fetch webpage: {}", e),
        };
        
        let html = match res.text().await {
            Ok(t) => t,
            Err(e) => return format!("Failed to read webpage content: {}", e),
        };
        
        // Strip down the HTML to plain text using html2text to save token limits
        // Let's cap the width at 100 columns and return it
        let text = html2text::from_read(html.as_bytes(), 100);
        
        // If the webpage is huge, we should probably cap it to avoid blowing up the LLM context limit
        let max_chars = 15000;
        if text.len() > max_chars {
            format!("{}\n\n...(truncated)", &text[..max_chars])
        } else {
            text
        }
    }

    /// Write a new MCP-compatible skill to disk.
    ///
    /// Creates:
    ///   `skills/{name}/tool.json`   — MCP tool descriptor
    ///   `skills/{name}/handler.js`  — (or handler.py)
    pub fn save_skill(
        &self,
        name: &str,
        description: &str,
        input_schema: &Value,
        code: &str,
        language: &str,
    ) -> Result<PathBuf, Box<dyn std::error::Error + Send + Sync>> {
        let ext = match language {
            "javascript" => "js",
            _ => return Err("Unsupported skill language. Only javascript is allowed.".into()),
        };

        // Create skill folder
        let skill_dir = self.skills_dir.join(name);
        std::fs::create_dir_all(&skill_dir)?;

        // Normalise input_schema: if the model passed a flat key→type map, wrap
        // it into a proper JSON Schema object so tool.json is always compliant.
        let normalised_schema = normalise_input_schema(input_schema);

        // Write tool.json
        let created_at = chrono::Utc::now().to_rfc3339();
        let tool_json = serde_json::json!({
            "name": name,
            "description": description,
            "inputSchema": normalised_schema,
            "approved": false,
            "created_at": created_at,
            "last_used_at": serde_json::Value::Null,
        });
        let tool_path = skill_dir.join("tool.json");
        let tool_file = std::fs::File::create(&tool_path)?;
        serde_json::to_writer_pretty(tool_file, &tool_json)?;

        // Write handler script
        let handler_path = skill_dir.join(format!("handler.{}", ext));
        std::fs::write(&handler_path, code)?;

        // Validate Javascript syntax
        if language == "javascript" {
            let mut cmd = std::process::Command::new("node");
            cmd.arg("--check").arg(&handler_path);
            match cmd.output() {
                Ok(output) => {
                    if !output.status.success() {
                        let _ = std::fs::remove_dir_all(&skill_dir);
                        let stderr = String::from_utf8(output.stderr).unwrap_or_default();
                        return Err(format!("JavaScript syntax check failed:\n{}", stderr).into());
                    }
                }
                Err(e) => {
                    if e.kind() != std::io::ErrorKind::NotFound {
                        let _ = std::fs::remove_dir_all(&skill_dir);
                        return Err(format!("Failed to validate JavaScript: {}", e).into());
                    }
                    // If node is not installed/found, skip validation
                }
            }
        }

        Ok(skill_dir)
    }
}

/// Wrap a flat `{ "key": "type" }` map into a proper JSON Schema inputSchema
/// object if it isn't already one. The model sometimes emits either form.
fn normalise_input_schema(schema: &Value) -> Value {
    if schema.get("type").is_some() && schema.get("properties").is_some() {
        // Already a proper JSON Schema object
        return schema.clone();
    }

    // Flat map — convert each entry into a property descriptor
    let mut properties = serde_json::Map::new();
    let mut required = Vec::new();

    if let Some(obj) = schema.as_object() {
        for (key, val) in obj {
            let type_str = val.as_str().unwrap_or("string");
            properties.insert(
                key.clone(),
                serde_json::json!({ "type": type_str }),
            );
            required.push(serde_json::Value::String(key.clone()));
        }
    }

    serde_json::json!({
        "type": "object",
        "properties": properties,
        "required": required,
    })
}

/// Load a skill from a folder. Returns `None` if the folder is missing
/// `tool.json` or no handler script is found.
fn load_skill_folder(dir: &Path) -> Option<Skill> {
    let tool_path = dir.join("tool.json");
    if !tool_path.exists() {
        return None;
    }

    let raw = std::fs::read_to_string(&tool_path).ok()?;
    let tool: Value = serde_json::from_str(&raw).ok()?;

    let name = tool.get("name")?.as_str()?.to_string();
    let description = tool.get("description")?.as_str()?.to_string();
    let input_schema = tool
        .get("inputSchema")
        .cloned()
        .unwrap_or(serde_json::json!({"type":"object","properties":{}}));

    let approved = tool.get("approved").and_then(|v| v.as_bool()).unwrap_or(false);
    let created_at = tool.get("created_at")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
    let last_used_at = tool.get("last_used_at")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    // Locate handler script
    let js_handler = dir.join("handler.js");

    let (handler_path, language) = if js_handler.exists() {
        (js_handler.to_string_lossy().to_string(), "javascript".to_string())
    } else {
        return None;
    };

    let code = std::fs::read_to_string(&handler_path).unwrap_or_default();

    Some(Skill {
        name,
        description,
        input_schema,
        handler_path,
        language,
        approved,
        created_at,
        last_used_at,
        code,
    })
}

#[cfg(test)]
mod tests {
    use super::*;


    fn make_registry(dir: &std::path::Path) -> SkillRegistry {
        SkillRegistry::new(dir.to_path_buf())
    }

    #[test]
    fn test_save_and_list_js_skill() {
        let tmp = std::env::temp_dir().join("persona_skill_test_list");
        let _ = std::fs::remove_dir_all(&tmp);
        let registry = make_registry(&tmp);

        let schema = serde_json::json!({ "a": "number", "b": "number" });
        registry
            .save_skill(
                "multiply_numbers",
                "Multiplies two numbers",
                &schema,
                "const args = JSON.parse(process.argv[2]);\nconsole.log(JSON.stringify({ result: args.a * args.b }));",
                "javascript",
            )
            .unwrap();

        let skills = registry.list_skills().unwrap();
        let s = skills.iter().find(|x| x.name == "multiply_numbers").expect("multiply_numbers skill should be present");
        assert_eq!(s.name, "multiply_numbers");
        assert_eq!(s.language, "javascript");
        assert_eq!(s.approved, false); // New skills are unapproved by default

        // inputSchema must be a proper JSON Schema object
        assert_eq!(s.input_schema["type"], "object");
        assert!(s.input_schema["properties"]["a"].is_object());

        let _ = std::fs::remove_dir_all(&tmp);
    }

    // (Skipping test_execute_js_skill because it requires Node.js to be installed in the CI/test environment)


    #[test]
    fn test_proper_schema_passthrough() {
        let tmp = std::env::temp_dir().join("persona_skill_test_schema");
        let _ = std::fs::remove_dir_all(&tmp);
        let registry = make_registry(&tmp);

        // Pass a full JSON Schema object directly (model already emitted it properly)
        let schema = serde_json::json!({
            "type": "object",
            "properties": {
                "principal": { "type": "number", "description": "Loan amount" }
            },
            "required": ["principal"]
        });
        registry
            .save_skill("loan_calc", "Calculates loan", &schema, "console.log('{}');", "javascript")
            .unwrap();

        let skills = registry.list_skills().unwrap();
        let s = &skills[0];
        assert_eq!(s.input_schema["required"][0], "principal");

        let _ = std::fs::remove_dir_all(&tmp);
    }
}
