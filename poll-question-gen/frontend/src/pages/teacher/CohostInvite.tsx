import { useAuth } from "@/lib/hooks/use-auth";
import { useParams, useNavigate } from "@tanstack/react-router";
import api from "@/lib/api/api";
import { toast } from "sonner";

const CohostInvite = () => {
    const params = useParams({ from: '/teacher/cohost-invite/$token' });
    const token: string = params.token as string;
    const navigate = useNavigate();
    const { user } = useAuth();

    const handleAcceptInvite = async () => {
        try {
            if (!user?.uid) {
                toast.error("Authentication required to create assessments");
                return;
                }
            const response:any = await api.post("/livequizzes/rooms/cohost", { token,userId:user.uid });
            let { roomId, message } = response.data;
            toast.success(message ?? 'joined as cohost successfully')
            navigate({ to: `/teacher/pollroom/${roomId}` });
        } catch (error:any) {
            console.error("Error joining as co-host:", error);
            if (error.response?.data?.message === "jwt expired") {
                toast.error("Invite link has expired.");
            } else if (error.response?.data?.message === "Host cannot join as cohost"){
                navigate({ to: `/teacher/manage-rooms` });
                toast.error(error.response?.data?.message ?? "Host cannot join as cohost")
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