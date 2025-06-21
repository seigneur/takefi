#!/bin/bash

# Bitcoin Oracle Backend Installation and Setup Script
# Run this script to set up the development environment

echo "🚀 Setting up Bitcoin Oracle Backend..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 16+ first."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 16 ]; then
    echo "❌ Node.js version must be 16 or higher. Current version: $(node -v)"
    exit 1
fi

echo "✅ Node.js version: $(node -v)"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo "✅ Dependencies installed successfully"

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    echo "✅ .env file created. Please configure your environment variables."
    echo "📋 Edit .env file with your AWS credentials and settings:"
    echo "   - AWS_REGION"
    echo "   - AWS_ACCESS_KEY_ID (optional if using IAM roles)"
    echo "   - AWS_SECRET_ACCESS_KEY (optional if using IAM roles)"
    echo "   - BITCOIN_NETWORK (testnet/mainnet)"
else
    echo "✅ .env file already exists"
fi

# Run tests to verify installation
echo "🧪 Running tests to verify installation..."
npm test

if [ $? -ne 0 ]; then
    echo "❌ Some tests failed. Please check the configuration."
    exit 1
fi

echo "✅ All tests passed!"

# Check AWS configuration (optional)
echo "🔧 Checking AWS configuration..."
if command -v aws &> /dev/null; then
    echo "✅ AWS CLI is installed"
    aws sts get-caller-identity &> /dev/null
    if [ $? -eq 0 ]; then
        echo "✅ AWS credentials are configured"
    else
        echo "⚠️  AWS credentials not configured or invalid"
        echo "   Configure using: aws configure"
        echo "   Or use IAM roles for EC2/ECS deployment"
    fi
else
    echo "⚠️  AWS CLI not installed (optional for development)"
    echo "   Install using: pip install awscli"
fi

echo ""
echo "🎉 Bitcoin Oracle Backend setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Configure your .env file with proper values"
echo "   2. Set up AWS Secrets Manager (if using AWS)"
echo "   3. Start development server: npm run dev"
echo "   4. Test the API: curl http://localhost:3000/health"
echo ""
echo "📚 Documentation:"
echo "   - README.md for detailed setup instructions"
echo "   - API documentation in docs/ folder"
echo "   - Example requests in test/ folder"
echo ""
echo "🚀 Happy coding!"
