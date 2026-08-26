use async_trait::async_trait;
use futures_util::stream::{self, BoxStream};
use futures_util::StreamExt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::error::Error;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenerateOptions {
    pub model_name: String,
    pub temperature: f32,
    pub max_tokens: Option<usize>,
    pub system_prompt: Option<String>,
    pub stop_sequences: Vec<String>,
    pub json_mode: bool,
    /// Number of GPU layers to offload. -1 = auto-detect, 0 = CPU only.
    pub num_gpu: Option<i32>,
    /// Context window size in tokens. None = Ollama default (usually 2048).
    pub num_ctx: Option<usize>,
    /// Number of tokens to keep in the KV cache across turns (prompt caching).
    /// Setting this to a small positive integer keeps the system prompt warm,
    /// so only new tokens need to be evaluated on each turn.
    pub num_keep: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub role: String, // "system", "user", "assistant"
    pub content: String,
    pub images: Option<Vec<String>>,
}

#[async_trait]
pub trait ModelProvider: Send + Sync {
    /// Generate a single completion from a prompt (non-streaming; reserved for future model providers)
    #[allow(dead_code)]
    async fn generate(
        &self,
        prompt: &str,
        options: &GenerateOptions,
    ) -> Result<String, Box<dyn Error + Send + Sync>>;

    /// Generate a streaming response from a list of chat messages
    async fn chat_stream(
        &self,
        messages: &[ChatMessage],
        options: &GenerateOptions,
    ) -> Result<BoxStream<'static, Result<String, Box<dyn Error + Send + Sync>>>, Box<dyn Error + Send + Sync>>;

    /// Generate a vector embedding for a single text chunk
    async fn embed(
        &self,
        text: &str,
        model_name: &str,
    ) -> Result<Vec<f32>, Box<dyn Error + Send + Sync>>;

    /// Batch generate vector embeddings for multiple text chunks
    async fn embed_batch(
        &self,
        texts: &[String],
        model_name: &str,
    ) -> Result<Vec<Vec<f32>>, Box<dyn Error + Send + Sync>>;

    /// List all local/available models from the runtime provider
    async fn list_models(&self) -> Result<Vec<String>, Box<dyn Error + Send + Sync>>;
}

pub struct OllamaProvider {
    client: Client,
    base_url: String,
}

impl OllamaProvider {
    pub fn new(base_url: String) -> Self {
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(300))
            .build()
            .unwrap_or_else(|_| Client::new());
        Self {
            client,
            base_url,
        }
    }
}

#[allow(dead_code)]
#[derive(Serialize)]
struct OllamaGenerateRequest {
    model: String,
    prompt: String,
    system: Option<String>,
    stream: bool,
    options: OllamaOptions,
    #[serde(skip_serializing_if = "Option::is_none")]
    format: Option<String>,
}

#[allow(dead_code)]
#[derive(Deserialize)]
struct OllamaGenerateResponse {
    response: String,
}

#[derive(Serialize)]
struct OllamaOptions {
    temperature: f32,
    stop: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    num_predict: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    num_gpu: Option<i32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    num_ctx: Option<usize>,
    /// Tokens to keep in KV cache — enables system-prompt caching across turns.
    #[serde(skip_serializing_if = "Option::is_none")]
    num_keep: Option<i32>,
}



#[derive(Serialize)]
struct OllamaChatRequest {
    model: String,
    messages: Vec<OllamaChatMessage>,
    stream: bool,
    options: OllamaOptions,
    #[serde(skip_serializing_if = "Option::is_none")]
    format: Option<String>,
}

#[derive(Serialize, Deserialize)]
struct OllamaChatMessage {
    role: String,
    content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    images: Option<Vec<String>>,
}

#[derive(Deserialize)]
struct OllamaChatStreamResponse {
    message: Option<OllamaChatMessage>,
    done: bool,
}

#[derive(Serialize)]
struct OllamaEmbedRequest {
    model: String,
    input: Vec<String>,
}

#[derive(Deserialize)]
struct OllamaEmbedResponse {
    embeddings: Vec<Vec<f32>>,
}

// Fallback legacy request
#[derive(Serialize)]
struct OllamaLegacyEmbedRequest {
    model: String,
    prompt: String,
}

#[derive(Deserialize)]
struct OllamaLegacyEmbedResponse {
    embedding: Vec<f32>,
}

#[async_trait]
impl ModelProvider for OllamaProvider {
    async fn generate(
        &self,
        prompt: &str,
        options: &GenerateOptions,
    ) -> Result<String, Box<dyn Error + Send + Sync>> {
        let url = format!("{}/api/generate", self.base_url);
        
        let format_opt = if options.json_mode {
            Some("json".to_string())
        } else {
            None
        };

        let req_body = OllamaGenerateRequest {
            model: options.model_name.clone(),
            prompt: prompt.to_string(),
            system: options.system_prompt.clone(),
            stream: false,
            options: OllamaOptions {
                temperature: options.temperature,
                stop: options.stop_sequences.clone(),
                num_predict: options.max_tokens,
                num_gpu: options.num_gpu,
                num_ctx: options.num_ctx,
                num_keep: options.num_keep,
            },
            format: format_opt,
        };

        let response = self.client.post(&url)
            .json(&req_body)
            .send()
            .await?;

        if !response.status().is_success() {
            return Err(format!("Ollama API returned status: {}", response.status()).into());
        }

        let body: OllamaGenerateResponse = response.json().await?;
        Ok(body.response)
    }

    async fn chat_stream(
        &self,
        messages: &[ChatMessage],
        options: &GenerateOptions,
    ) -> Result<BoxStream<'static, Result<String, Box<dyn Error + Send + Sync>>>, Box<dyn Error + Send + Sync>> {
        let url = format!("{}/api/chat", self.base_url);

        let tauri_messages: Vec<OllamaChatMessage> = messages
            .iter()
            .map(|m| OllamaChatMessage {
                role: m.role.clone(),
                content: m.content.clone(),
                images: m.images.clone(),
            })
            .collect();

        let format_opt = if options.json_mode {
            Some("json".to_string())
        } else {
            None
        };

        let req_body = OllamaChatRequest {
            model: options.model_name.clone(),
            messages: tauri_messages,
            stream: true,
            options: OllamaOptions {
                temperature: options.temperature,
                stop: options.stop_sequences.clone(),
                num_predict: options.max_tokens,
                num_gpu: options.num_gpu,
                num_ctx: options.num_ctx,
                num_keep: options.num_keep,
            },
            format: format_opt,
        };

        println!("Sending payload to Ollama: {}", serde_json::to_string(&req_body).unwrap_or_default());
        let mut response = self.client.post(&url)
            .json(&req_body)
            .send()
            .await?;

        println!("Ollama chat stream response status: {}", response.status());

        if !response.status().is_success() {
            let status = response.status();
            let err_text = response.text().await.unwrap_or_default();
            
            // Auto-fallback: If model doesn't support multimodal data but we sent images in the thread, retry without images
            if status.as_u16() == 400 && err_text.contains("Multimodal data provided") {
                println!("Model does not support multimodal data. Retrying without images...");
                let mut fallback_body = req_body;
                for msg in &mut fallback_body.messages {
                    msg.images = None;
                }
                
                response = self.client.post(&url)
                    .json(&fallback_body)
                    .send()
                    .await?;
                    
                if !response.status().is_success() {
                    let retry_status = response.status();
                    let retry_err = response.text().await.unwrap_or_default();
                    return Err(format!("Ollama API returned status: {}. Details: {}", retry_status, retry_err).into());
                }
            } else {
                return Err(format!("Ollama API returned status: {}. Details: {}", status, err_text).into());
            }
        }

        let bytes_stream = response.bytes_stream();
        let buffer = Vec::new();

        let line_stream = stream::unfold((bytes_stream, buffer), |(mut stream, mut buf)| async move {
            loop {
                // Yield parsed line if there is one
                if let Some(pos) = buf.iter().position(|&b| b == b'\n') {
                    let line_bytes = buf.drain(..=pos).collect::<Vec<u8>>();
                    if let Ok(line_str) = String::from_utf8(line_bytes) {
                        if let Ok(parsed) = serde_json::from_str::<OllamaChatStreamResponse>(&line_str) {
                            if let Some(msg) = parsed.message {
                                return Some((Ok(msg.content), (stream, buf)));
                            }
                            if parsed.done {
                                return None;
                            }
                        } else {
                            println!("Failed to parse OllamaChatStreamResponse: {}", line_str);
                        }
                    }
                }

                // Read more bytes
                match stream.next().await {
                    Some(Ok(bytes)) => {
                        println!("Received bytes: {}", bytes.len());
                        buf.extend_from_slice(&bytes);
                    }
                    Some(Err(e)) => {
                        println!("Stream error: {:?}", e);
                        return Some((Err(Box::new(e) as Box<dyn Error + Send + Sync>), (stream, buf)));
                    }
                    None => {
                        println!("Stream EOF. Buffer len: {}", buf.len());
                        // EOF
                        if !buf.is_empty() {
                            let final_bytes = std::mem::take(&mut buf);
                            if let Ok(line_str) = String::from_utf8(final_bytes) {
                                if let Ok(parsed) = serde_json::from_str::<OllamaChatStreamResponse>(&line_str) {
                                    if let Some(msg) = parsed.message {
                                        return Some((Ok(msg.content), (stream, buf)));
                                    }
                                } else {
                                    println!("Failed to parse EOF OllamaChatStreamResponse: {}", line_str);
                                }
                            }
                        }
                        return None;
                    }
                }
            }
        });

        Ok(line_stream.boxed())
    }

    async fn embed(
        &self,
        text: &str,
        model_name: &str,
    ) -> Result<Vec<f32>, Box<dyn Error + Send + Sync>> {
        let embeddings = self.embed_batch(&[text.to_string()], model_name).await?;
        if embeddings.is_empty() {
            return Err("Ollama returned an empty embedding list".into());
        }
        Ok(embeddings[0].clone())
    }

    async fn embed_batch(
        &self,
        texts: &[String],
        model_name: &str,
    ) -> Result<Vec<Vec<f32>>, Box<dyn Error + Send + Sync>> {
        let url_embed = format!("{}/api/embed", self.base_url);
        
        let req_body = OllamaEmbedRequest {
            model: model_name.to_string(),
            input: texts.to_vec(),
        };

        let response = self.client.post(&url_embed)
            .json(&req_body)
            .send()
            .await?;

        if response.status().is_success() {
            let body: OllamaEmbedResponse = response.json().await?;
            return Ok(body.embeddings);
        }

        // Fallback to legacy `/api/embeddings` if `/api/embed` is not supported (404/500)
        let url_legacy = format!("{}/api/embeddings", self.base_url);
        let mut embeddings = Vec::new();

        for text in texts {
            let req_body_legacy = OllamaLegacyEmbedRequest {
                model: model_name.to_string(),
                prompt: text.clone(),
            };
            
            let res = self.client.post(&url_legacy)
                .json(&req_body_legacy)
                .send()
                .await?;
                
            if !res.status().is_success() {
                return Err(format!("Legacy Ollama API returned status: {}", res.status()).into());
            }
            
            let body: OllamaLegacyEmbedResponse = res.json().await?;
            embeddings.push(body.embedding);
        }

        Ok(embeddings)
    }

    async fn list_models(&self) -> Result<Vec<String>, Box<dyn Error + Send + Sync>> {
        let url = format!("{}/api/tags", self.base_url);
        
        let response = match self.client.get(&url).send().await {
            Ok(res) => res,
            Err(_) => {
                return Ok(vec![
                    "llama3.2:latest".to_string(),
                    "llama3.1:latest".to_string(),
                ]);
            }
        };

        if !response.status().is_success() {
            return Ok(vec![
                "llama3.2:latest".to_string(),
                "llama3.1:latest".to_string(),
            ]);
        }

        #[derive(Deserialize)]
        struct OllamaModelInfo {
            name: String,
        }
        #[derive(Deserialize)]
        struct OllamaTagsResponse {
            models: Vec<OllamaModelInfo>,
        }

        if let Ok(body) = response.json::<OllamaTagsResponse>().await {
            let names: Vec<String> = body.models.into_iter().map(|m| m.name).collect();
            if names.is_empty() {
                Ok(vec![
                    "llama3.2:latest".to_string(),
                    "llama3.1:latest".to_string(),
                ])
            } else {
                Ok(names)
            }
        } else {
            Ok(vec![
                "llama3.2:latest".to_string(),
                "llama3.1:latest".to_string(),
            ])
        }
    }
}
