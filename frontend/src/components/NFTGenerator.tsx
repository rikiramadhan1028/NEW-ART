import React, { useState } from 'react';
import { useAccount, useReadContract } from 'wagmi';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Upload, 
  Settings, 
  Zap, 
  Image as ImageIcon, 
  Download,
  CheckCircle,
  XCircle,
  AlertCircle,
  Sparkles,
  Layers,
  Globe,
  Hash,
  LoaderIcon,
  ExternalLink,
  ArrowLeft,
  ArrowRight
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import WalletConnectButton from './WalletConnectButton';

// Smart Contract Constants
const WHITELIST_MANAGER_CONTRACT_ADDRESS = '0xAdDC5958Cb111A424e2ef1Ddcc2B4D0e132a8BdD' as const;

// ABI dari WhitelistManager.sol
const WHITELIST_MANAGER_ABI = [
  {"inputs":[],"stateMutability":"nonpayable","type":"constructor"},
  {"inputs":[{"internalType":"address","name":"owner","type":"address"}],"name":"OwnableInvalidOwner","type":"error"},
  {"inputs":[{"internalType":"address","name":"account","type":"address"}],"name":"OwnableUnauthorizedAccount","type":"error"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"_address","type":"address"}],"name":"AddressRemovedFromWhitelist","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"_address","type":"address"}],"name":"AddressWhitelisted","type":"event"},
  {"anonymous":false,"inputs":[{"indexed":true,"internalType":"address","name":"previousOwner","type":"address"},{"indexed":true,"internalType":"address","name":"newOwner","type":"address"}],"name":"OwnershipTransferred","type":"event"},
  {"inputs":[{"internalType":"address","name":"_address","type":"address"}],"name":"addAddressToWhitelist","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"address","name":"_address","type":"address"}],"name":"isWhitelisted","outputs":[{"internalType":"bool","name":"","type":"bool"}],"stateMutability":"view","type":"function"},
  {"inputs":[],"name":"owner","outputs":[{"internalType":"address","name":"","type":"address"}],"stateMutability":"view","type":"function"},
  {"inputs":[{"internalType":"address","name":"_address","type":"address"}],"name":"removeAddressFromWhitelist","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[],"name":"renounceOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"},
  {"inputs":[{"internalType":"address","name":"newOwner","type":"address"}],"name":"transferOwnership","outputs":[],"stateMutability":"nonpayable","type":"function"}
] as const;

const BACKEND_URL = "http://localhost:3001"

const NFTGenerator = () => {
  const [step, setStep] = useState(1);
  const { toast } = useToast();
  
  // Wagmi hooks
  const { address, isConnected } = useAccount();

  // Collection state
  const [collectionName, setCollectionName] = useState('');
  const [collectionDescription, setCollectionDescription] = useState('');
  const [baseIpfsImageUrl, setBaseIpfsImageUrl] = useState('');
  const [baseExternalUrl, setBaseExternalUrl] = useState('');
  const [nftCount, setNftCount] = useState(0);
  const [assetZipFile, setAssetZipFile] = useState<File | null>(null);
  const [compressImages, setCompressImages] = useState(false);
  const [generationStatus, setGenerationStatus] = useState('');
  const [jobId, setJobId] = useState<string | null>(null);
  const [downloadLink, setDownloadLink] = useState('');

  // Metadata update state
  const [metadataZipFile, setMetadataZipFile] = useState<File | null>(null);
  const [imageIpfsCid, setImageIpfsCid] = useState('');
  const [imageIpfsGatewayUrl, setImageIpfsGatewayUrl] = useState('');
  const [updateStatus, setUpdateStatus] = useState('');
  const [updatedMetadataDownloadLink, setUpdatedMetadataDownloadLink] = useState('');

  // Wagmi hook untuk check whitelist status
  const { data: isUserWhitelisted, isLoading: isWhitelistLoading, isError: isWhitelistError } = useReadContract({
    address: WHITELIST_MANAGER_CONTRACT_ADDRESS,
    abi: WHITELIST_MANAGER_ABI,
    functionName: 'isWhitelisted',
    args: address ? [address] : undefined,
    query: {
      enabled: isConnected && !!address,
      refetchInterval: 5000,
    },
  });

  const steps = [
    { id: 1, title: 'Connect Wallet', icon: () => <div className="h-6 w-6 text-white" /> },
    { id: 2, title: 'Collection Details', icon: Settings },
    { id: 3, title: 'Upload Assets', icon: Upload },
    { id: 4, title: 'Generate NFTs', icon: Zap },
    { id: 5, title: 'Update Metadata', icon: Hash }
  ];

  // Auto-advance ke step 2 ketika wallet connected
  React.useEffect(() => {
    if (isConnected && step === 1) {
      //setStep(2);
      toast({
        title: "Wallet Connected!",
        description: "Your wallet has been successfully connected.",
      });
    }
  }, [isConnected, step]);

  const handleNftCountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const count = parseInt(e.target.value);
    setNftCount(count);
  };

  const handleAssetUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && (file.type === 'application/zip' || file.type === 'application/x-zip-compressed')) {
      setAssetZipFile(file);
      toast({
        title: "File uploaded!",
        description: `${file.name} has been selected for upload.`,
      });
    } else {
      setAssetZipFile(null);
      toast({
        title: "Invalid file",
        description: "Please upload a valid .zip file.",
        variant: "destructive",
      });
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const handleGenerate = async () => {
    if (!isConnected) {
      setGenerationStatus('Please connect your wallet first.');
      return;
    }
    if (!isUserWhitelisted) {
      setGenerationStatus('Your wallet is not whitelisted to generate NFTs. Please contact the owner.');
      return;
    }
    if (nftCount === 0 || !assetZipFile || !collectionName || !collectionDescription) {
      setGenerationStatus('Please fill all required fields, upload your asset zip, and ensure NFT count is valid.');
      return;
    }
    if (nftCount > 5000) {
      setGenerationStatus('Error: NFT count is outside the valid range (1 - 5,000).');
      return;
    }

    setGenerationStatus('Whitelisted! Sending generation request...');
    setDownloadLink('');
    setJobId(null);

    const formData = new FormData();
    formData.append('nftCount', nftCount.toString());
    formData.append('collectionName', collectionName);
    formData.append('collectionDescription', collectionDescription);
    formData.append('baseIpfsImageUrl', baseIpfsImageUrl);
    formData.append('baseExternalUrl', baseExternalUrl);
    formData.append('assetsZip', assetZipFile);
    formData.append('userAddress', address || '0x');
    formData.append('compressImages', String(compressImages));

    try {
      const response = await fetch(`${BACKEND_URL}/api/generate`, {
        method: 'POST',
        body: formData,
    });

      const data = await response.json();
      if (response.ok) {
        setJobId(data.jobId);
        setGenerationStatus(`Generation request accepted! Job ID: ${data.jobId}. Processing...`);
        
        // Poll for status updates
        const pollStatus = setInterval(async () => {
          const statusResponse = await fetch(`${BACKEND_URL}/api/job-status/${data.jobId}`);
          const statusData = await statusResponse.json();

          if (statusData.status === 'COMPLETED_FOR_DOWNLOAD') {
            clearInterval(pollStatus);
            setGenerationStatus(`Generation complete! Download your NFT zip file.`);
            setDownloadLink(`${BACKEND_URL}${statusData.zipDownloadUrl}`);
          } else if (statusData.status === 'FAILED') {
            clearInterval(pollStatus);
            setGenerationStatus(`Generation failed for job ID: ${data.jobId}. Please try again.`);
          } else {
            setGenerationStatus(`${statusData.status}...`);
          }
        }, 5000);

      } else {
        setGenerationStatus(`Error from backend: ${data.error}`);
      }
    } catch (error: any) {
      setGenerationStatus(`Network error: ${error.message}. Ensure backend is running.`);
      console.error('Frontend generation error:', error);
    }
  };

  const handleMetadataZipUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && (file.type === 'application/zip' || file.type === 'application/x-zip-compressed')) {
      setMetadataZipFile(file);
      toast({
        title: "Metadata file uploaded!",
        description: `${file.name} has been selected for metadata update.`,
      });
    } else {
      setMetadataZipFile(null);
      toast({
        title: "Invalid file",
        description: "Please upload a valid .zip file.",
        variant: "destructive",
      });
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const handleUpdateMetadata = async () => {
    if (!imageIpfsCid || !metadataZipFile || !imageIpfsGatewayUrl) {
      setUpdateStatus('Please provide an image IPFS CID, an IPFS gateway URL, and upload a metadata zip file.');
      return;
    }
    
    setUpdateStatus('Updating metadata...');
    setUpdatedMetadataDownloadLink('');

    let finalImageIpfsGatewayUrl = imageIpfsGatewayUrl;
    if (finalImageIpfsGatewayUrl && !finalImageIpfsGatewayUrl.endsWith('/')) {
      finalImageIpfsGatewayUrl += '/';
    }

    const formData = new FormData();
    formData.append('imageIpfsCid', imageIpfsCid);
    formData.append('imageIpfsGatewayUrl', finalImageIpfsGatewayUrl);
    formData.append('metadataZip', metadataZipFile);

    try {
      const response = await fetch(`${BACKEND_URL}/api/update-metadata`, {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      if (response.ok) {
        setUpdateStatus('Metadata updated successfully! Download the new zip file.');
        setUpdatedMetadataDownloadLink(`${BACKEND_URL}${data.zipDownloadUrl}`);
      } else {
        setUpdateStatus(`Error updating metadata: ${data.error}`);
      }
    } catch (error: any) {
      setUpdateStatus(`Network error: ${error.message}. Ensure backend is running.`);
    }
  };

  // Navigation functions
  const goToPreviousStep = () => {
    if (step > 1) {
      setStep(step - 1);
    }
  };

  const goToNextStep = () => {
    if (step < 5) {
      setStep(step + 1);
    }
  };

  // Check if user can go to next step
  const canProceedToNextStep = () => {
    switch (step) {
      case 1:
        return isConnected;
      case 2:
        return collectionName && collectionDescription;
      case 3:
        return assetZipFile;
      case 4:
        return true; // Always can proceed from step 4
      case 5:
        return true; // Last step
      default:
        return false;
    }
  };

  const isGenerateDisabled = !isConnected ||
                             !isUserWhitelisted ||
                             nftCount === 0 ||
                             !assetZipFile ||
                             !collectionName ||
                             !collectionDescription ||
                             isWhitelistLoading;

  return (
    <div className="min-h-screen p-4 lg:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 mb-4">
            <div className="p-3 rounded-2xl bg-gradient-hero glow-effect">
              <Sparkles className="h-8 w-8 text-white" />
            </div>
            <h1 className="text-5xl font-bold bg-gradient-hero bg-clip-text text-transparent">
              NFT Generator
            </h1>
          </div>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Create stunning NFT collections with ease. Upload your assets, configure your collection, and generate unique NFTs in minutes.
          </p>
        </div>

        {/* Wallet Status */}
        {isConnected && (
  <div className="max-w-4xl mx-auto mb-8">
    <Card 
  className={`transition-all duration-300 ${
    isUserWhitelisted
      ? "bg-green-500/10 border-green-500/30"
      : "bg-red-500/10 border-red-500/30"
  }`}
>
  <CardContent className="p-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {isUserWhitelisted ? (
          <CheckCircle className="h-5 w-5 text-green-400" />
        ) : (
          <XCircle className="h-5 w-5 text-red-500" />
        )}
        <div>
          <p className="font-medium">Wallet Connected</p>
          <p className="text-sm text-muted-foreground">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </p>
        </div>
      </div>
      <Badge 
        variant="secondary" 
        className={
          isUserWhitelisted
            ? "bg-green-600/20 text-green-400"
            : "bg-red-600/20 text-red-400"
        }
      >
        {isUserWhitelisted ? 'Whitelisted' : 'Not Whitelisted'}
      </Badge>
    </div>
  </CardContent>
</Card>

  </div>
)}


        {/* Progress Steps */}
        <div className="mb-12">
          <div className="flex items-center justify-between max-w-4xl mx-auto">
            {steps.map((stepItem, index) => {
              const Icon = stepItem.icon;
              const isActive = step === stepItem.id;
              const isCompleted = step > stepItem.id;
              
              return (
                <div key={stepItem.id} className="flex items-center">
                  <div className={`flex flex-col items-center ${index !== steps.length - 1 ? 'flex-1' : ''}`}>
                    <div className={`
                      w-12 h-12 rounded-full flex items-center justify-center mb-2 transition-all duration-300 cursor-pointer
                      ${isActive ? 'bg-gradient-hero shadow-glow scale-110' : 
                        isCompleted ? 'bg-success' : 'bg-muted'}
                    `}
                    onClick={() => {
                      // Allow navigation to completed steps or current step
                      if (stepItem.id <= step) {
                        setStep(stepItem.id);
                      }
                    }}
                    >
                      {isCompleted ? (
                        <CheckCircle className="h-6 w-6 text-white" />
                      ) : (
                        <Icon className={`h-6 w-6 ${isActive ? 'text-white' : 'text-muted-foreground'}`} />
                      )}
                    </div>
                    <span className={`text-sm font-medium text-center ${isActive ? 'text-primary' : 'text-muted-foreground'}`}>
                      {stepItem.title}
                    </span>
                  </div>
                  {index !== steps.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-4 ${isCompleted ? 'bg-success' : 'bg-muted'}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="max-w-4xl mx-auto mb-8">
          <div className="flex justify-between">
            <Button 
              variant="outline" 
              onClick={goToPreviousStep}
              disabled={step === 1}
              className="flex items-center gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Previous Step
            </Button>
            
            <div className="text-sm text-muted-foreground flex items-center">
              Step {step} of {steps.length}
            </div>
            
            <Button 
  onClick={goToNextStep}
  disabled={step === 5 || !canProceedToNextStep() || (isConnected && step > 1 && (!isUserWhitelisted || isWhitelistLoading))}
  className="flex items-center gap-2"
>
  Next Step
  <ArrowRight className="h-4 w-4" />
</Button>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-4xl mx-auto">
          <Tabs value={step.toString()} className="w-full">
            <TabsList className="hidden" />
            
            {/* Step 1: Connect Wallet */}
            <TabsContent value="1" className="mt-0">
              <Card className="card-gradient border-border/50 shadow-card-custom">
                <CardHeader className="text-center pb-6">
                  <div className="w-20 h-20 mx-auto mb-4 bg-gradient-hero rounded-full flex items-center justify-center glow-effect">
                    <Sparkles className="h-10 w-10 text-white" />
                  </div>
                  <CardTitle className="text-3xl">Connect Your Wallet</CardTitle>
                  <CardDescription className="text-lg">
                    Connect your Web3 wallet to start creating your NFT collection
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-center">
                  <div className="inline-block">
                    <WalletConnectButton />
                  </div>
                  <p className="text-sm text-muted-foreground mt-4">
                    We support MetaMask, WalletConnect, and other popular wallets
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Step 2: Collection Details */}
            <TabsContent value="2" className="mt-0">
              <Card className="card-gradient border-border/50 shadow-card-custom">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-2xl">
                    <Settings className="h-6 w-6 text-primary" />
                    Collection Details
                  </CardTitle>
                  <CardDescription>
                    Configure your NFT collection metadata and settings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="collection-name" className="text-base font-medium">Collection Name</Label>
                      <Input 
                        id="collection-name" 
                        placeholder="e.g., CyberPunks 2077"
                        className="h-12"
                        value={collectionName}
                        onChange={(e) => setCollectionName(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="external-url" className="text-base font-medium">External URL</Label>
                      <Input 
                        id="external-url" 
                        placeholder="https://yourproject.com"
                        className="h-12"
                        value={baseExternalUrl}
                        onChange={(e) => setBaseExternalUrl(e.target.value)}
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="description" className="text-base font-medium">Description</Label>
                    <Textarea 
                      id="description" 
                      placeholder="A collection of unique digital beings..."
                      className="min-h-[100px]"
                      value={collectionDescription}
                      onChange={(e) => setCollectionDescription(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="ipfs-url" className="text-base font-medium">Base IPFS Image Gateway URL (Optional)</Label>
                    <Input 
                      id="ipfs-url" 
                      placeholder="https://ipfs.io/ipfs/your_collection_cid/"
                      className="h-12"
                      value={baseIpfsImageUrl}
                      onChange={(e) => setBaseIpfsImageUrl(e.target.value)}
                    />
                    <p className="text-sm text-muted-foreground">
                      This will be the base image URL in your metadata. Leave empty if unsure; the backend will fill it automatically after upload.
                    </p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Step 3: Upload Assets */}
            <TabsContent value="3" className="mt-0">
              <Card className="card-gradient border-border/50 shadow-card-custom">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-2xl">
                    <Layers className="h-6 w-6 text-primary" />
                    Upload Your Assets
                  </CardTitle>
                  <CardDescription>
                    Upload your trait layers as a single ZIP file
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors">
                    <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <h3 className="text-lg font-semibold mb-2">Upload Assets ZIP File</h3>
                    <p className="text-muted-foreground mb-4">
                      Upload one ZIP file containing all your layer folders (e.g., Backgrounds/, Bodies/, Eyes/).
                      All images should be PNG/JPG/JPEG format.
                    </p>
                    <input
                      type="file"
                      accept=".zip"
                      onChange={handleAssetUpload}
                      className="hidden"
                      id="asset-upload"
                    />
                    <Button asChild variant="outline" size="lg">
                      <label htmlFor="asset-upload" className="cursor-pointer">
                        Choose ZIP File
                      </label>
                    </Button>
                    {assetZipFile && (
                      <p className="text-success text-sm mt-2">
                        Selected: {assetZipFile.name}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center space-x-2 p-4 bg-muted/50 rounded-lg">
                    <Switch 
                      id="optimize" 
                      checked={compressImages}
                      onCheckedChange={setCompressImages}
                    />
                    <Label htmlFor="optimize" className="text-sm">
                      Optimize Generated NFT Image File Sizes
                    </Label>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    If enabled, the final generated NFT images will be optimized for smaller file sizes.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Step 4: Generate NFTs */}
            <TabsContent value="4" className="mt-0">
              <Card className="card-gradient border-border/50 shadow-card-custom">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-2xl">
                    <Zap className="h-6 w-6 text-primary" />
                    Generate Your Collection
                  </CardTitle>
                  <CardDescription>
                    Set the collection size and generate your unique NFTs
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="nft-count" className="text-base font-medium">Number of NFTs to Generate</Label>
                    <Input 
                      id="nft-count" 
                      type="number"
                      min="1"
                      max="5000"
                      placeholder="1000"
                      className="h-12"
                      value={nftCount || ''}
                      onChange={handleNftCountChange}
                    />
                    <p className="text-sm text-muted-foreground">Maximum: 5,000 NFTs per collection</p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="p-4 bg-muted/50 rounded-lg text-center">
                      <ImageIcon className="h-8 w-8 mx-auto mb-2 text-primary" />
                      <p className="font-semibold">{assetZipFile ? '✓' : '12'}</p>
                      <p className="text-sm text-muted-foreground">Trait Layers</p>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg text-center">
                      <Layers className="h-8 w-8 mx-auto mb-2 text-primary" />
                      <p className="font-semibold">2.4M</p>
                      <p className="text-sm text-muted-foreground">Possible Combinations</p>
                    </div>
                    <div className="p-4 bg-muted/50 rounded-lg text-center">
                      <CheckCircle className="h-8 w-8 mx-auto mb-2 text-success" />
                      <p className="font-semibold">{isUserWhitelisted ? 'Ready' : 'Pending'}</p>
                      <p className="text-sm text-muted-foreground">Wallet Status</p>
                    </div>
                  </div>

                  {/* Whitelist Status */}
                  {isConnected && address ? (
                    isWhitelistLoading ? (
                      <div className="p-4 bg-muted/50 rounded-lg flex items-center gap-2">
                        <LoaderIcon className="h-5 w-5 animate-spin text-muted-foreground" />
                        <p className="text-sm">Checking whitelist status...</p>
                      </div>
                    ) : isWhitelistError ? (
                      <div className="p-4 bg-warning/10 border border-warning/20 rounded-lg flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-warning" />
                        <p className="text-sm">Error checking whitelist status. Is contract address correct?</p>
                      </div>
                    ) : isUserWhitelisted ? (
                      <div className="p-4 bg-success/10 border border-success/20 rounded-lg flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-success" />
                        <p className="text-sm">You are Whitelisted! 🎉</p>
                      </div>
                    ) : (
                      <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-destructive" />
                        <p className="text-sm">You are NOT Whitelisted. Please contact the owner.</p>
                      </div>
                    )
                  ) : (
                    <div className="p-4 bg-warning/10 border border-warning/20 rounded-lg flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-warning" />
                      <p className="text-sm">Connect your wallet to check whitelist status.</p>
                    </div>
                  )}

                  <Button 
                    onClick={handleGenerate}
                    className="w-full bg-gradient-hero hover:scale-[1.02] transition-all duration-300 pulse-glow-animation"
                    size="lg"
                    disabled={isGenerateDisabled}
                  >
                    <Zap className="mr-2 h-5 w-5" />
                    Generate NFTs
                  </Button>

                  {generationStatus && (
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm font-medium">Status: {generationStatus}</p>
                      {jobId && <p className="text-sm text-muted-foreground mt-1">Job ID: {jobId}</p>}
                    </div>
                  )}

{downloadLink && (
  <div className="p-4 bg-success/10 border border-success/20 rounded-lg">
    <p className="text-sm font-medium mb-2">Generation complete!</p>
    <Button asChild variant="outline" size="sm">
      <a href={downloadLink} target="_blank" rel="noopener noreferrer">
        <Download className="mr-2 h-4 w-4" />
        Download NFT Zip File
        <ExternalLink className="ml-2 h-4 w-4" />
      </a>
    </Button>

    {/* Instructions for the next steps */}
    <div className="mt-4 p-3 bg-muted/50 rounded-lg border border-border/50 text-sm">
      <p className="font-semibold text-primary mb-2">Next Steps:</p>
      <ol className="list-decimal list-inside space-y-1">
        <li>Unzip the downloaded file. It contains two folders: **`images`** and **`metadata`**.</li>
        <li>Upload the **`images`** folder directly to your preferred IPFS Gateway. Most services support folder uploads, but you can also zip it if needed.</li>
        <li>**Important:** Go into the **`metadata`** folder, select all the files inside (e.g., `1.json`, `2.json`), and re-archive them into a new ZIP file.</li>
        <li>Use this new ZIP file of your metadata and the image information from step 2 to fill out the form in the **"Update Metadata"** tab (Step 5).</li>
      </ol>
    </div>
  </div>
)}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Step 5: Update Metadata */}
            <TabsContent value="5" className="mt-0">
              <Card className="card-gradient border-border/50 shadow-card-custom">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-2xl">
                    <Hash className="h-6 w-6 text-primary" />
                    Update Metadata
                  </CardTitle>
                  <CardDescription>
                    Update your metadata with IPFS image information
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="ipfs-cid" className="text-base font-medium">Image Folder IPFS CID</Label>
                      <Input 
                        id="ipfs-cid" 
                        placeholder="QmX..."
                        className="h-12"
                        value={imageIpfsCid}
                        onChange={(e) => setImageIpfsCid(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="gateway-url" className="text-base font-medium">IPFS Gateway URL</Label>
                      <Input 
                        id="gateway-url" 
                        placeholder="https://ipfs.io/ipfs/"
                        className="h-12"
                        value={imageIpfsGatewayUrl}
                        onChange={(e) => setImageIpfsGatewayUrl(e.target.value)}
                      />
                      <p className="text-sm text-muted-foreground">
                        Make sure the URL ends with a forward slash (/). Example: https://ipfs.io/ipfs/
                      </p>
                    </div>
                  </div>

                  <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
                    <Download className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
                    <h3 className="font-semibold mb-2">Upload Metadata ZIP</h3>
                    <p className="text-sm text-muted-foreground mb-4">
                      Upload your existing metadata ZIP file to update with new image URLs
                    </p>
                    <input
                      type="file"
                      accept=".zip"
                      onChange={handleMetadataZipUpload}
                      className="hidden"
                      id="metadata-upload"
                    />
                    <Button asChild variant="outline">
                      <label htmlFor="metadata-upload" className="cursor-pointer">
                        Choose Metadata ZIP
                      </label>
                    </Button>
                    {metadataZipFile && (
                      <p className="text-success text-sm mt-2">
                        Selected: {metadataZipFile.name}
                      </p>
                    )}
                  </div>

                  <Button 
                    onClick={handleUpdateMetadata}
                    className="w-full bg-gradient-hero hover:scale-[1.02] transition-all duration-300"
                    size="lg"
                    disabled={!imageIpfsCid || !metadataZipFile || !imageIpfsGatewayUrl}
                  >
                    <Download className="mr-2 h-5 w-5" />
                    Update & Download Metadata
                  </Button>

                  {updateStatus && (
                    <div className="p-4 bg-muted/50 rounded-lg">
                      <p className="text-sm font-medium">Status: {updateStatus}</p>
                    </div>
                  )}

                  {updatedMetadataDownloadLink && (
                    <div className="p-4 bg-success/10 border border-success/20 rounded-lg">
                      <p className="text-sm font-medium mb-2">Metadata updated!</p>
                      <Button asChild variant="outline" size="sm">
                        <a href={updatedMetadataDownloadLink} target="_blank" rel="noopener noreferrer">
                          <Download className="mr-2 h-4 w-4" />
                          Download Updated Metadata
                          <ExternalLink className="ml-2 h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Footer */}
        <div className="text-center mt-16 text-muted-foreground">
          <p>© 2025 NFT Generator. Built with ❤️ for creators.</p>
        </div>
      </div>
    </div>
  );
};

export default NFTGenerator;
