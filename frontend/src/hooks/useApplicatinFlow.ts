import { useState, useCallback } from "react"
import { useNavigate } from "react-router-dom"
import useUserAxios from "@/hooks/useUserAxios"
import type {
  ApplicationStep,
  ApplicationFormState,
  ApplicationAnswer,
  Job,
  ApplicationResponse
} from "@/lib/types"

export function useApplicationFlow(job: Job) {
  const axios = useUserAxios()
  const navigate = useNavigate()

  const [step, setStep] = useState<ApplicationStep>(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
const [isPriorApplication, setIsPriorApplication] = useState(false)

  const [formState, setFormState] = useState<ApplicationFormState>({
    jobId: job.id,
    applicationId: null,
    answers: [],
    resumeFile: null,
    resumeId: null,
  })

  const clearError = () => setError(null)

  const handleGetStarted = useCallback(async () => {
  setIsLoading(true)
  setError(null)
  try {
    // 1. Check if user already has an application for this job
    const { data: existing } = await axios.get<ApplicationResponse[]>("/applications/")
    const prior = existing.find((a) => a.job_id === job.id)

    if (prior) {
        setIsPriorApplication(true)

      setFormState((prev) => ({
        ...prev,
        applicationId: prior.id,
        answers: prior.job_responses
          ? JSON.parse(prior.job_responses).map(
              (r: { question: string; answer: string }, i: number) => ({
                questionId: String(i),
                question: r.question,
                answer: r.answer,
              })
            )
          : [],
        resumeId: prior.resumes?.[0]?.id ?? null,
      }))

      // Jump to the step they left off at (cap at last step)
      const resumeStep = Math.min(prior.step, 3) as ApplicationStep
      if (resumeStep > 0) {
        setStep(resumeStep)
        return  // skip creating a new one
      }
    }

    // 2. No prior application — create fresh
    const { data } = await axios.post<ApplicationResponse>("/applications/", {
      job_id: job.id,
      job_responses: null,
    })
    setFormState((prev) => ({ ...prev, applicationId: data.id }))
    setStep(1)

  } catch (err: any) {
    const msg = err?.response?.data?.detail
    setError(typeof msg === "string" ? msg : "Failed to start application.")
  } finally {
    setIsLoading(false)
  }
}, [axios, job.id])

  // Step 1 → 2: Save answers
  const handleAnswersSubmit = useCallback(
    async (answers: ApplicationAnswer[]) => {
      setIsLoading(true)
      setError(null)
      try {
        const job_responses = JSON.stringify(
          answers.map((a) => ({ question: a.question, answer: a.answer }))
        )
        await axios.patch(`/applications/${formState.applicationId}`, {
          job_responses,
        })
        setFormState((prev) => ({ ...prev, answers }))
        setStep(2)
      } catch {
        setError("Failed to save answers. Please try again.")
      } finally {
        setIsLoading(false)
      }
    },
    [axios, formState.applicationId]
  )

  // Step 2 → 3: Upload resume
  const handleResumeUpload = useCallback(
    async (file: File) => {
      setIsLoading(true)
      setError(null)
      try {
        const formData = new FormData()
        formData.append("file", file)
        const { data } = await axios.post(
          `/applications/${formState.applicationId}/resumes`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" } }
        )
        setFormState((prev) => ({
          ...prev,
          resumeFile: file,
          resumeId: data.id,
        }))
        setStep(3)
      } catch (err: any) {
        const detail = err?.response?.data?.detail
        if (typeof detail === "object" && detail?.errors) {
          setError(detail.errors.join(", "))
        } else if (typeof detail === "string") {
          setError(detail)
        } else {
          setError("Failed to upload resume. Check the file and try again.")
        }
      } finally {
        setIsLoading(false)
      }
    },
    [axios, formState.applicationId]
  )

  // Step 3: Finalize — update step to mark complete
  const handleSubmit = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      await axios.patch(`/applications/${formState.applicationId}`, { step: 4 })
      navigate("/my-applications")
    } catch {
      setError("Failed to submit application. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }, [axios, formState.applicationId, navigate])

  const goBack = () => {
    if (step > 0) setStep((prev) => (prev - 1) as ApplicationStep)
  }

  return {
    step,
    formState,
    isLoading,
    error,
    isPriorApplication,
    clearError,
    handleGetStarted,
    handleAnswersSubmit,
    handleResumeUpload,
    handleSubmit,
    goBack,
  }
}