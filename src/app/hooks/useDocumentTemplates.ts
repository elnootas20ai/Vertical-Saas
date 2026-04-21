import { useEffect, useState } from 'react';
import {
  duplicateDocumentTemplate,
  loadDocumentTemplates,
  saveDocumentTemplates,
  type DocumentTemplate,
} from '../lib/documentTemplates';

export function useDocumentTemplates() {
  const [templates, setTemplates] = useState<DocumentTemplate[]>(() => loadDocumentTemplates());

  useEffect(() => {
    saveDocumentTemplates(templates);
  }, [templates]);

  const upsertTemplate = (nextTemplate: DocumentTemplate) => {
    setTemplates((currentTemplates) => {
      const exists = currentTemplates.some((template) => template.id === nextTemplate.id);
      return exists
        ? currentTemplates.map((template) => (template.id === nextTemplate.id ? nextTemplate : template))
        : [nextTemplate, ...currentTemplates];
    });
  };

  const duplicateTemplate = (template: DocumentTemplate) => {
    const duplicatedTemplate = duplicateDocumentTemplate(template);
    setTemplates((currentTemplates) => [duplicatedTemplate, ...currentTemplates]);
    return duplicatedTemplate;
  };

  return {
    templates,
    setTemplates,
    upsertTemplate,
    duplicateTemplate,
  };
}
