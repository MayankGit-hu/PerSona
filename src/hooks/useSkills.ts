import { useState, useCallback } from "react";
import { ApiAdapter, Skill } from "../api_client";

export function useSkills(
  getApiClient: () => ApiAdapter,
  showToast: (msg: string, type: "success" | "error" | "info") => void
) {
  const [skills, setSkills] = useState<Skill[]>([]);
  const [showAddSkill, setShowAddSkill] = useState(false);
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillDesc, setNewSkillDesc] = useState("");
  const [newSkillSchema, setNewSkillSchema] = useState(
    '{"type":"object","properties":{"paramName":{"type":"string"}},"required":["paramName"]}'
  );
  const [newSkillCode, setNewSkillCode] = useState("");
  const [newSkillLang, setNewSkillLang] = useState("javascript");

  const [rawEditorOpen, setRawEditorOpen] = useState(false);
  const [rawEditorSkillName, setRawEditorSkillName] = useState("");
  const [rawToolJson, setRawToolJson] = useState("");
  const [rawHandlerJs, setRawHandlerJs] = useState("");

  const loadSkills = useCallback(async () => {
    try {
      const list = await getApiClient().listSkills();
      setSkills(list);
    } catch (err) {
      console.error("Failed to load skills:", err);
    }
  }, [getApiClient]);

  const handleSaveSkill = async () => {
    if (!newSkillName.trim() || !newSkillCode.trim()) {
      showToast("Skill name and handler code are required", "error");
      return;
    }
    let inputSchemaObj = {};
    try {
      inputSchemaObj = JSON.parse(newSkillSchema);
    } catch (e) {
      showToast("Invalid JSON Schema in parameters definition", "error");
      return;
    }

    try {
      const toolJsonStr = JSON.stringify(
        {
          name: newSkillName.trim(),
          description: newSkillDesc.trim(),
          inputSchema: inputSchemaObj,
        },
        null,
        2
      );

      await getApiClient().saveSkillFiles(newSkillName.trim(), toolJsonStr, newSkillCode);
      showToast(`Skill '${newSkillName.trim()}' saved successfully`, "success");
      setShowAddSkill(false);
      setNewSkillName("");
      setNewSkillDesc("");
      setNewSkillCode("");
      await loadSkills();
    } catch (err: any) {
      showToast(`Failed to save skill: ${err.message || err}`, "error");
    }
  };

  const handleDeleteSkill = async (name: string) => {
    try {
      await getApiClient().deleteSkill(name);
      showToast(`Skill '${name}' deleted`, "success");
      await loadSkills();
    } catch (err: any) {
      showToast(`Failed to delete skill: ${err.message || err}`, "error");
    }
  };

  const openRawEditor = async (skillName: string) => {
    try {
      const files = await getApiClient().getSkillFiles(skillName);
      setRawEditorSkillName(skillName);
      setRawToolJson(files.tool_json);
      setRawHandlerJs(files.handler_js);
      setRawEditorOpen(true);
    } catch (err: any) {
      showToast(`Failed to load skill files: ${err.message || err}`, "error");
    }
  };

  const handleSaveRawSkill = async () => {
    try {
      await getApiClient().saveSkillFiles(rawEditorSkillName, rawToolJson, rawHandlerJs);
      showToast(`Skill '${rawEditorSkillName}' updated`, "success");
      setRawEditorOpen(false);
      await loadSkills();
    } catch (err: any) {
      showToast(`Failed to save skill: ${err.message || err}`, "error");
    }
  };

  return {
    skills,
    showAddSkill,
    setShowAddSkill,
    newSkillName,
    setNewSkillName,
    newSkillDesc,
    setNewSkillDesc,
    newSkillSchema,
    setNewSkillSchema,
    newSkillCode,
    setNewSkillCode,
    newSkillLang,
    setNewSkillLang,
    rawEditorOpen,
    setRawEditorOpen,
    rawEditorSkillName,
    rawToolJson,
    setRawToolJson,
    rawHandlerJs,
    setRawHandlerJs,
    loadSkills,
    handleSaveSkill,
    handleDeleteSkill,
    openRawEditor,
    handleSaveRawSkill,
  };
}
