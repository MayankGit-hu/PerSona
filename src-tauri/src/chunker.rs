#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct Chunk {
    pub text: String,
    pub index: usize,
}

pub fn chunk_text(text: &str, chunk_size: usize, overlap: usize) -> Vec<Chunk> {
    if text.trim().is_empty() {
        return Vec::new();
    }

    let chars: Vec<char> = text.chars().collect();
    if chars.len() <= chunk_size {
        return vec![Chunk {
            text: text.trim().to_string(),
            index: 0,
        }];
    }

    let mut chunks = Vec::new();
    let mut start = 0;
    let mut index = 0;

    while start < chars.len() {
        let mut end = start + chunk_size;
        if end >= chars.len() {
            end = chars.len();
        } else {
            // Search window for a good split point in the last 20% of the chunk
            let search_start = start + (chunk_size * 4 / 5);
            let mut split_point = end;
            let mut found = false;

            // 1. Try splitting at paragraph boundaries (\n\n)
            for i in (search_start..end).rev() {
                if i + 1 < chars.len() && chars[i] == '\n' && chars[i + 1] == '\n' {
                    split_point = i + 2;
                    found = true;
                    break;
                }
            }

            // 2. Try splitting at single newline boundaries (\n)
            if !found {
                for i in (search_start..end).rev() {
                    if chars[i] == '\n' {
                        split_point = i + 1;
                        found = true;
                        break;
                    }
                }
            }

            // 3. Try splitting at sentence boundaries (. , ? , !)
            if !found {
                for i in (search_start..end).rev() {
                    if chars[i] == '.' || chars[i] == '?' || chars[i] == '!' {
                        if i + 1 < chars.len() && chars[i + 1] == ' ' {
                            split_point = i + 2;
                            found = true;
                            break;
                        }
                    }
                }
            }

            // 4. Try splitting at word boundaries (spaces)
            if !found {
                for i in (search_start..end).rev() {
                    if chars[i] == ' ' {
                        split_point = i + 1;
                        break;
                    }
                }
            }

            end = split_point;
        }

        let chunk_text: String = chars[start..end].iter().collect();
        let trimmed = chunk_text.trim();
        if !trimmed.is_empty() {
            chunks.push(Chunk {
                text: trimmed.to_string(),
                index,
            });
            index += 1;
        }

        if end == chars.len() {
            break;
        }

        let prev_start = start;
        if end > overlap {
            start = end - overlap;
        } else {
            start = end;
        }

        // Prevent infinite loops in case overlap config or split edge case gets stuck
        if start <= prev_start {
            start = prev_start + 1;
        }
    }

    chunks
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chunk_text_simple() {
        let text = "This is a simple sentence. This is another sentence. We will test chunking here.";
        let chunks = chunk_text(text, 30, 5);
        assert!(!chunks.is_empty());
        assert_eq!(chunks[0].index, 0);
    }
    
    #[test]
    fn test_chunk_text_empty() {
        let chunks = chunk_text("", 30, 5);
        assert!(chunks.is_empty());
    }
}
