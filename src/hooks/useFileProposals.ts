import { useState } from "react";
import { ChatMessage, ChatMessagePart } from "../types/ai";

export function useFileProposals(
  messages: ChatMessage[],
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
  activeTab: string | null,
  setFileText: (text: string) => void
) {
  const [reviewProposalId, setReviewProposalId] = useState<string | null>(null);

  const updateProposal = (
    id: string,
    updater: (part: Extract<ChatMessagePart, { type: "file_proposal" }>) => ChatMessagePart
  ) => {
    setMessages((prev) =>
      prev.map((message) => ({
        ...message,
        parts: message.parts.map((part) =>
          part.type === "file_proposal" && part.id === id ? updater(part) : part
        ),
      }))
    );
  };

  const acceptProposal = async (id: string, allProposals: any[]) => {
    const proposal = allProposals.find((item) => item.id === id);
    if (!proposal || proposal.status !== "pending") return;
    updateProposal(id, (part) => ({ ...part, status: "accepted", error: undefined }));
    window.dispatchEvent(new CustomEvent('codegrey:explorer-refresh'));
    window.dispatchEvent(new CustomEvent('codegrey:stats-refresh'));
    if (activeTab === proposal.filePath) setFileText(proposal.newContent);
    if (reviewProposalId === id) setReviewProposalId(null);
  };

  const rejectProposal = async (id: string, allProposals: any[]) => {
    const proposal = allProposals.find((item) => item.id === id);
    if (!proposal) return;

    if (proposal.oldContent === "") {
      await window.codegrey?.workspace?.deleteFile?.(proposal.filePath);
    } else {
      await window.codegrey?.workspace?.writeFile?.(proposal.filePath, proposal.oldContent);
    }
    window.dispatchEvent(new CustomEvent('codegrey:explorer-refresh'));
    window.dispatchEvent(new CustomEvent('codegrey:stats-refresh'));

    updateProposal(id, (part) => ({ ...part, status: "rejected" }));
    if (activeTab === proposal.filePath) setFileText(proposal.oldContent);
    if (reviewProposalId === id) setReviewProposalId(null);
  };

  const acceptAllProposals = async (pendingProposals: any[], allProposals: any[]) => {
    for (const proposal of pendingProposals) {
      await acceptProposal(proposal.id, allProposals);
    }
  };

  return {
    reviewProposalId,
    setReviewProposalId,
    acceptProposal,
    rejectProposal,
    acceptAllProposals,
  };
}
