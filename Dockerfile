FROM paperist/texlive-ja:latest

WORKDIR /workdir

# Install any additional packages if needed

# Install Python and dependencies
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv

# Create a virtual environment and install python dependencies
ENV VIRTUAL_ENV=/opt/venv
RUN python3 -m venv $VIRTUAL_ENV
ENV PATH="$VIRTUAL_ENV/bin:$PATH"

RUN pip install fastapi uvicorn python-multipart

CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
