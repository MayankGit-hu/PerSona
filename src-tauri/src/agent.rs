use crate::models::{ChatMessage, ModelProvider, GenerateOptions};
use crate::skills::SkillRegistry;
use crate::db::Database;
use std::sync::Arc;
use futures_util::StreamExt;
use serde_json::Value;

pub struct AgentExecutor {
    pub provider: Arc<dyn ModelProvider>,
    pub skills: Arc<SkillRegistry>,
    pub db: Arc<Database>,
    pub chat_model: String,
    pub num_gpu: Option<i32>,
    pub num_ctx: Option<usize>,
}

impl AgentExecutor {
    pub fn new(
        provider: Arc<dyn ModelProvider>,
        skills: Arc<SkillRegistry>,
        db: Arc<Database>,
        chat_model: String,
    ) -> Self {
        Self {
            provider,
            skills,
            db,
            chat_model,
            num_gpu: None,
            num_ctx: None,
        }
    }

    pub fn with_runtime_settings(mut self, num_gpu: Option<i32>, num_ctx: Option<usize>) -> Self {
        self.num_gpu = num_gpu;
        self.num_ctx = num_ctx;
        self
    }

    pub async fn run_agent_loop(
        &self,
        thread_id: &str,
        _user_message: &str,
        _images: Option<Vec<String>>,
        context_str: &str,
        on_chunk: &impl Fn(String),
    ) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
        let history = self.db.get_chat_history(thread_id)?;
        let mut messages = Vec::new();

        // Determine base system prompt and allowed skills (default or from custom agent)
        let mut base_prompt = String::from("You are PerSona, an autonomous local AI knowledge assistant.\n\
        If you generate code, SVGs, or HTML, you MUST wrap it in an `<antArtifact>` XML block so it can be previewed in the user's Artifacts UI.\n\
        Format: `<antArtifact identifier=\"unique-id\" type=\"text/html\" title=\"Title\">...code...</antArtifact>`.\n\
        Supported types: `text/html`, `image/svg+xml`, `application/vnd.antigravity.react`.\n");
        let mut allowed_skills: Option<Vec<String>> = None;

        if let Ok(threads) = self.db.list_threads() {
            if let Some(thread) = threads.iter().find(|t| t.id == thread_id) {
                if let Some(agent_id) = &thread.agent_id {
                    if let Ok(Some(agent)) = self.db.get_agent(agent_id) {
                        base_prompt = format!("{}\n\n", agent.system_prompt);
                        if let Ok(parsed) = serde_json::from_str::<Vec<String>>(&agent.skills) {
                            if !parsed.is_empty() {
                                allowed_skills = Some(parsed);
                            }
                        }
                    }
                }
            }
        }

        let registered_skills = self.skills.list_skills()?;
        let mut skills_list = String::new();
        for s in &registered_skills {
            if let Some(allowed) = &allowed_skills {
                if !allowed.contains(&s.name) {
                    continue;
                }
            }
            skills_list.push_str(&format!(
                "- Name: {}\n  Description: {}\n  inputSchema: {}\n\n",
                s.name, s.description, s.input_schema
            ));
        }

        let system_prompt = format!(
             "{}You can execute local scripts (skills) as tools to answer the user's request.\n\
              If the user asks for real-time information, current events, weather, or anything you don't know, YOU MUST USE the 'web_search' tool to find the answer!\n\
              If the user explicitly asks you to 'create a skill' or 'write a skill', or asks you to build a reusable helper script, automate a background task, or run a calculation, you MUST call 'synthesize_skill' first to write and register the code. Calling 'synthesize_skill' is the ONLY way to save a script tool to the registry.\n\
              HOWEVER, if the user asks you to create a UI, generate an SVG graphic, write a document, or just show them regular code, do NOT call 'synthesize_skill'. Instead, just output the code directly and wrap it in an `<antArtifact>` block.\n\
              CRITICAL RULE: DO NOT create an `<antArtifact>` when the user asks you to search the web! You MUST output a `<tool>` block to use the 'web_search' skill instead.\n\
              Here are your available skills/tools:\n\
              {}\
              - Name: synthesize_skill\n  \
               Description: Write and register a new custom skill (JavaScript script) that you can call in later steps or future conversations. Call this when you notice a repeated task or want to automate a computation. The skill requires user approval before you can run it. To update/fix an existing skill, simply call this again with the same name to overwrite it.\n  \
               inputSchema: {{\n    \
                 \"name\": \"string (snake_case identifier, e.g. calculate_amortization)\",\n    \
                 \"description\": \"string (detailed summary of what the skill does)\",\n    \
                 \"input_schema\": \"object (MCP JSON Schema: {{ type, properties: {{ param: {{ type, description }} }}, required: [] }})\",\n    \
                 \"code\": \"string (JavaScript script for Node.js. Read args via JSON.parse(process.argv[2]). Write result to stdout.)\",\n    \
                 \"language\": \"string (must be 'javascript')\"\n  \
               }}\n\n\
              To use a tool, you MUST wrap a valid JSON object inside a `<tool>` XML block. The JSON object must contain 'name' and 'arguments' fields.\n\
              Example Tool Call:\n\
              <tool>\n\
              {{\"name\": \"tool_name\", \"arguments\": {{\"arg_key\": \"arg_value\"}}}}\n\
              </tool>\n\n\
              If you do not need to use a tool, simply write your response directly in plain markdown text. Do not use JSON wrappers for regular responses.\n\n\
             AVAILABLE KNOWLEDGE BASE CONTEXT:\n\
             {}\n\
             Use the context above to answer the user's request if relevant.\n\n\
             SYSTEM METADATA:\n\
             Current Date and Time: {}",
            base_prompt,
            skills_list,
            context_str,
            chrono::Local::now().to_rfc2822()
        );

        messages.push(ChatMessage {
            role: "system".to_string(),
            content: system_prompt,
            images: None,
        });

        for msg in history {
            messages.push(ChatMessage {
                role: msg.role,
                content: msg.content,
                images: msg.images,
            });
        }

        let options = GenerateOptions {
            model_name: self.chat_model.clone(),
            temperature: 0.1, // Low temperature for consistent JSON matching
            max_tokens: None,
            system_prompt: None,
            stop_sequences: Vec::new(),
            json_mode: false,
            num_gpu: self.num_gpu,
            num_ctx: self.num_ctx,
            // Keep the first 24 tokens (system instruction prefix) in KV cache so
            // Ollama doesn't re-evaluate the entire prompt from scratch each turn.
            num_keep: Some(24),
        };

        let mut loop_count = 0;
        let max_loops = 5;

        while loop_count < max_loops {
            println!("AgentExecutor: Loop step {}", loop_count);
            
             let mut stream = self.provider.chat_stream(&messages, &options).await?;
             let mut raw_response = String::new();
             let mut tool_buffer = String::new();
             let mut in_tool_block = false;

             while let Some(chunk_res) = stream.next().await {
                 if let Ok(ref chunk) = chunk_res {
                     println!("LLM Stream Chunk: {:?}", chunk);
                     raw_response.push_str(chunk);
                 } else if let Err(ref e) = chunk_res {
                     println!("LLM Stream Error: {:?}", e);
                 }

                 if let Ok(chunk) = chunk_res {
                     if !in_tool_block {
                         if raw_response.contains("<tool>") {
                             in_tool_block = true;
                             // Extract anything before <tool> that hasn't been streamed yet?
                             // Since we stream instantly, the characters '<too' might have already slipped through to the UI.
                             // That is a minor visual artifact we can live with for now to guarantee 0ms latency.
                             
                             // Add the part of the chunk that came after <tool> to the buffer
                             if let Some(idx) = raw_response.find("<tool>") {
                                 tool_buffer.push_str(&raw_response[idx + 6..]);
                             }
                         } else {
                             // Stream regular text straight to the UI
                             let text_json = serde_json::json!({
                                 "type": "text",
                                 "text": chunk
                             });
                             on_chunk(text_json.to_string());
                         }
                     } else {
                         tool_buffer.push_str(&chunk);
                         if tool_buffer.contains("</tool>") {
                             break;
                         }
                     }
                 }
             }

             if in_tool_block {
                 // Extract JSON from tool buffer
                 let mut cleaned = tool_buffer.replace("</tool>", "");
                 if let Some(start_idx) = cleaned.find('{') {
                     if let Some(end_idx) = cleaned.rfind('}') {
                         cleaned = cleaned[start_idx..=end_idx].to_string();
                     }
                 }
                 
                 let response_json: Value = match serde_json::from_str(&cleaned) {
                     Ok(v) => v,
                     Err(e) => {
                         println!("Error parsing tool JSON: {} - {}", e, cleaned);
                         serde_json::json!({"name": "error", "arguments": {}})
                     }
                 };

                 let tool_name = response_json.get("tool").or_else(|| response_json.get("name")).and_then(|t| t.as_str()).unwrap_or("");
                 let args = response_json.get("arguments").cloned().unwrap_or(Value::Null);

                 println!("AgentExecutor: Tool Call -> {} with args: {}", tool_name, args);
                 
                 let step_json = serde_json::json!({
                     "type": "step",
                     "text": format!("\n⚙️ Running tool '{}'...\n", tool_name),
                 });
                 on_chunk(step_json.to_string());

                 let execution_result = if tool_name == "synthesize_skill" {
                     let name = args.get("name").and_then(|v| v.as_str()).unwrap_or("");
                     let desc = args.get("description").and_then(|v| v.as_str()).unwrap_or("");
                     let skill_schema = args
                         .get("input_schema")
                         .or_else(|| args.get("arguments"))
                         .cloned()
                         .unwrap_or(serde_json::json!({"type":"object","properties":{}}));
                     let code = args.get("code").and_then(|v| v.as_str()).unwrap_or("");
                     let lang = args.get("language").and_then(|v| v.as_str()).unwrap_or("javascript");

                     match self.skills.save_skill(name, desc, &skill_schema, code, lang) {
                         Ok(_) => format!("Success: Skill '{}' has been registered. IMPORTANT: You MUST stop and wait for the user to approve this skill in the UI before you can execute it.", name),
                         Err(e) => format!("Error registering skill: {}", e),
                     }
                 } else if tool_name == "error" {
                     "Tool parser failed to read JSON arguments".to_string()
                 } else {
                     match self.skills.execute_skill(tool_name, &args, self.db.clone()).await {
                         Ok(stdout) => stdout,
                         Err(e) => format!("Error executing skill: {}", e),
                     }
                 };

                 println!("AgentExecutor: Tool Result -> {}", execution_result);
                 
                 let result_json = serde_json::json!({
                     "type": "step",
                     "text": format!("✅ Tool '{}' resolved.\n", tool_name),
                 });
                 on_chunk(result_json.to_string());

                 messages.push(ChatMessage {
                     role: "assistant".to_string(),
                     content: format!("<tool>\n{}\n</tool>", serde_json::to_string(&response_json).unwrap_or_default()),
                     images: None,
                 });
                 messages.push(ChatMessage {
                     role: "user".to_string(),
                     content: format!("Tool result: {}", execution_result),
                     images: None,
                 });

                 loop_count += 1;
             } else {
                 // Remove trailing <tool partials if the stream ended abruptly
                 let final_text = raw_response.replace("<tool", "").trim().to_string();
                 return Ok(final_text);
             }
        }

        Err("Maximum tool-call loops reached without a final response".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::{ModelProvider, GenerateOptions, ChatMessage};
    use crate::skills::SkillRegistry;
    use crate::db::Database;
    use async_trait::async_trait;
    use futures_util::stream::{self, BoxStream};
    use std::sync::Arc;
    use std::sync::atomic::{AtomicUsize, Ordering};

    struct MockModelProvider {
        call_count: AtomicUsize,
    }

    #[async_trait]
    impl ModelProvider for MockModelProvider {
        async fn generate(&self, _prompt: &str, _options: &GenerateOptions) -> Result<String, Box<dyn std::error::Error + Send + Sync>> {
            unimplemented!()
        }

        async fn chat_stream(
            &self,
            _messages: &[ChatMessage],
            _options: &GenerateOptions,
        ) -> Result<BoxStream<'static, Result<String, Box<dyn std::error::Error + Send + Sync>>>, Box<dyn std::error::Error + Send + Sync>> {
            let count = self.call_count.fetch_add(1, Ordering::SeqCst);
            let response = if count == 0 {
                r#"<tool>{
                    "action": "call",
                    "tool": "synthesize_skill",
                    "arguments": {
                        "name": "mock_sum",
                        "description": "sums values",
                        "arguments": {"a": "number"},
                        "code": "console.log(123);",
                        "language": "javascript"
                    }
                }</tool>"#.to_string()
            } else {
                r#"Done registering and verifying!"#.to_string()
            };
            let chunk = Ok(response);
            let stream = stream::once(async move { chunk });
            Ok(Box::pin(stream))
        }

        async fn embed(
            &self,
            _text: &str,
            _model_name: &str,
        ) -> Result<Vec<f32>, Box<dyn std::error::Error + Send + Sync>> {
            Ok(vec![0.0; 384])
        }

        async fn embed_batch(
            &self,
            _texts: &[String],
            _model: &str,
        ) -> Result<Vec<Vec<f32>>, Box<dyn std::error::Error + Send + Sync>> {
            Ok(vec![vec![0.0; 384]])
        }

        async fn list_models(&self) -> Result<Vec<String>, Box<dyn std::error::Error + Send + Sync>> {
            Ok(vec!["llama3.2:latest".to_string()])
        }
    }

    #[tokio::test]
    async fn test_agent_synthesize_skill() {
        let test_uuid = uuid::Uuid::new_v4().to_string();
        let test_dir = std::env::temp_dir().join(format!("persona_test_{}", test_uuid));
        std::fs::create_dir_all(&test_dir).unwrap();
        
        let registry = Arc::new(SkillRegistry::new(test_dir.clone()));
        
        let db = Arc::new(Database::new(test_dir.clone()));
        db.init().unwrap();
        db.create_thread("thread_1", "Test Chat", None).unwrap();

        let mock_provider = Arc::new(MockModelProvider {
            call_count: AtomicUsize::new(0),
        });

        let executor = AgentExecutor::new(
            mock_provider.clone(),
            registry.clone(),
            db.clone(),
            "llama".to_string(),
        );

        let res = executor.run_agent_loop("thread_1", "create a skill please", None, "", &|_| {}).await;
        assert!(res.is_ok());
        assert_eq!(res.unwrap(), "Done registering and verifying!");

        // Verify that the skill folder exists with tool.json + handler.js
        let skill_dir  = test_dir.join("skills").join("mock_sum");
        let tool_json  = skill_dir.join("tool.json");
        let handler_js = skill_dir.join("handler.js");
        assert!(skill_dir.exists(),  "skill folder should exist");
        assert!(tool_json.exists(),  "tool.json should exist");
        assert!(handler_js.exists(), "handler.js should exist");

        // tool.json must be valid JSON with the MCP-required keys
        let tool_raw = std::fs::read_to_string(&tool_json).unwrap();
        let tool_val: serde_json::Value = serde_json::from_str(&tool_raw).unwrap();
        assert_eq!(tool_val["name"], "mock_sum");
        assert!(tool_val["inputSchema"].is_object());

        // handler must contain the actual code
        let handler_raw = std::fs::read_to_string(&handler_js).unwrap();
        assert!(handler_raw.contains("console.log(123);"));

        // Clean up test folder
        let _ = std::fs::remove_dir_all(&test_dir);
    }
}

