import { useState } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import api from "@/lib/api/api";
import { toast } from "sonner";

const CohostInvite = () => {
    const params = useParams({ strict: false });
    const token: string = String((params as any)?.token || '');
    const navigate = useNavigate();
    const [cohostName, setCohostName] = useState('');

    const handleAcceptInvite = async () => {
        try {
            if (!token) {
                toast.error("Invalid invite link");
                return;
            }

            const safeName = cohostName.trim();
            if (!safeName) {
                toast.error("Please enter your name");
                return;
            }

            const response:any = await api.post("/livequizzes/rooms/cohost", { token, cohostName: safeName });
            let { roomId, message, cohostId } = response.data;

            if (cohostId) {
                localStorage.setItem(`cohost-user-id:${roomId}`, cohostId);
            }

            toast.success(message ?? 'joined as cohost successfully')
            navigate({ to: `/teacher/pollroom/${roomId}` });
        } catch (error:any) {
            console.error("Error joining as co-host:", error);
            const message = error.response?.data?.message;
            if (message === "jwt expired") {
                toast.error("Invite link has expired.");
            } else if (message === "Host cannot join as cohost"){
                navigate({ to: `/teacher/manage-rooms` });
                toast.error(message ?? "Host cannot join as cohost")
            } else if (message === "Invalid room") {
                toast.error("This room is no longer active. Ask the host for a new invite link.");
            } else if (message === "Invite invalid or expired") {
                toast.error("This invite link is invalid or expired. Ask the host to generate a new one.");
            }
             else {
                toast.error("Failed to join as co-host. Please try again.");
            }
        }

        
    };
    

    return (
        <div className="min-h-screen flex items-center justify-center px-4 transition-colors duration-300">
            <div className="w-full max-w-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-8 text-center transition-colors duration-300">

                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                    Hi Educator,
                </p>

                <h2 className="text-xl md:text-2xl font-semibold text-gray-800 dark:text-white mb-4">
                    You’ve been invited to join as a Co-host
                </h2>

                <p className="text-gray-600 dark:text-gray-300 text-sm md:text-base mb-6 leading-relaxed">
                    Please accept the invitation below to access the room and start collaborating.
                </p>

                <input
                    value={cohostName}
                    onChange={(e) => setCohostName(e.target.value)}
                    placeholder="Enter your name"
                    className="w-full mb-4 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 px-3 py-2 text-sm text-gray-900 dark:text-gray-100"
                />

                <button
                    onClick={handleAcceptInvite}
                    className="w-full bg-gray-900 hover:bg-gray-800 dark:bg-white dark:text-gray-900 dark:hover:bg-gray-200 text-white py-2.5 rounded-lg text-sm font-medium transition"
                >
                    Accept Invitation
                </button>

            </div>
        </div>
    );
};

export default CohostInvite;